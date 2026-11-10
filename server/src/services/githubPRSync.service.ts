import { parseJsonLossless } from '../middleware/github-webhook';
import { generateInstallationAccessToken } from './githubInstallationToken.service';
import {
  acquireInstallationLock,
  renewInstallationLock,
  releaseInstallationLock,
  InstallationLock,
  InstallationIdLike,
  normalizeInstallationId,
} from './installationLock.service';
import crypto from 'crypto';

export interface PoolClientLike {
  query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number }>;
  release?: () => void;
}

export interface PoolLike {
  connect: () => Promise<PoolClientLike>;
}

export interface PRSyncSummary {
  installationId: string;
  fetched: number;
  upserted: number;
  failed: number;
  errors: string[];
  truncated: boolean;
  complete: boolean;
  failedRepositories: number;
  finalizationUncertain: boolean;
  renewalUncertain: boolean;
}

interface NormalizedPR {
  githubPrId: string;
  prNumber: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  draft: boolean;
  headBranch: string | null;
  baseBranch: string | null;
  headSha: string | null;
  baseSha: string | null;
  authorGithubId: string | null;
  authorLogin: string | null;
  createdAtGithub: string;
  updatedAtGithub: string;
  closedAtGithub: string | null;
  mergedAtGithub: string | null;
  htmlUrl: string;
  syncRunId?: string;
}

const SYNC_LOCK_TTL_MS = 120_000;
const SYNC_LOCK_RENEW_INTERVAL_MS = 45_000;
const PAGINATION_CAP_PAGES = 100;
const STALE_THRESHOLD_MINUTES = 60;

function toTextOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value);
  return s.length === 0 ? null : s;
}

function toExactId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const s = value.trim();
    return /^[1-9]\d*$/.test(s) ? s : null;
  }
  if (typeof value === 'bigint') {
    return value > 0n ? value.toString() : null;
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) return null;
    return String(value);
  }
  return null;
}

function toPositiveInt(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) return null;
    return value;
  }
  if (typeof value === 'string') {
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n <= 0 || String(n) !== value.trim()) return null;
    return n;
  }
  if (typeof value === 'bigint') {
    if (value <= 0n) return null;
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n <= 0) return null;
    return n;
  }
  return null;
}

function toIsoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function sanitizeSyncError(err: unknown): string {
  const msg = err instanceof Error && typeof err.message === 'string' ? err.message : 'sync error';
  return msg.slice(0, 120);
}

function generateSyncRunId(): string {
  return crypto.randomUUID();
}

function markIncomplete(summary: PRSyncSummary, message: string): void {
  summary.truncated = true;
  summary.complete = false;
  if (summary.errors.length < 20 && !summary.errors.includes(message)) {
    summary.errors.push(message);
  }
}

async function withShortClient<T>(db: PoolLike, fn: (client: PoolClientLike) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    return await fn(client);
  } finally {
    client.release?.();
  }
}

async function upsertPR(
  client: PoolClientLike,
  installationId: string,
  repositoryId: string,
  pr: NormalizedPR,
  syncRunId: string
): Promise<void> {
  await client.query(
    `INSERT INTO github_prs (
      installation_id, repository_id, github_pr_id, pr_number,
      title, body, state, draft, head_branch, base_branch,
      head_sha, base_sha, author_github_id, author_login,
      created_at_github, updated_at_github, closed_at_github, merged_at_github, html_url,
      last_synced_at, updated_at
    ) VALUES (
      $1, $2::bigint, $3, $4,
      $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14,
      $15, $16, $17, $18, $19,
      NOW(), NOW()
    )
    ON CONFLICT (installation_id, repository_id, github_pr_id) DO UPDATE SET
      pr_number = EXCLUDED.pr_number,
      title = EXCLUDED.title,
      body = EXCLUDED.body,
      state = EXCLUDED.state,
      draft = EXCLUDED.draft,
      head_branch = EXCLUDED.head_branch,
      base_branch = EXCLUDED.base_branch,
      head_sha = EXCLUDED.head_sha,
      base_sha = EXCLUDED.base_sha,
      author_github_id = EXCLUDED.author_github_id,
      author_login = EXCLUDED.author_login,
      created_at_github = EXCLUDED.created_at_github,
      updated_at_github = EXCLUDED.updated_at_github,
      closed_at_github = EXCLUDED.closed_at_github,
      merged_at_github = EXCLUDED.merged_at_github,
      html_url = EXCLUDED.html_url,
      last_synced_at = NOW(),
      updated_at = NOW()`,
    [
      installationId,
      repositoryId,
      pr.githubPrId,
      pr.prNumber,
      pr.title,
      pr.body,
      pr.state,
      pr.draft,
      pr.headBranch,
      pr.baseBranch,
      pr.headSha,
      pr.baseSha,
      pr.authorGithubId,
      pr.authorLogin,
      pr.createdAtGithub,
      pr.updatedAtGithub,
      pr.closedAtGithub,
      pr.mergedAtGithub,
       pr.htmlUrl,
     ]
   );
}

async function upsertPRBatch(
  db: PoolLike,
  installationId: string,
  repositoryId: string,
  prs: NormalizedPR[],
  syncRunId: string
): Promise<{ upserted: number; failed: number }> {
  let upserted = 0;
  let failed = 0;
  await withShortClient(db, async (client) => {
    for (const pr of prs) {
       try {
         await upsertPR(client, installationId, repositoryId, pr, syncRunId);
         upserted++;
       } catch (err) {
         failed++;
         console.error('PR upsert failed:', sanitizeSyncError(err));
       }
    }
  });
  return { upserted, failed };
}

async function fetchPRPage(
  token: string,
  repoOwner: string,
  repoName: string,
  page: number,
  perPage: number
): Promise<{ prs: NormalizedPR[]; hasNext: boolean }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const url = `https://api.github.com/repos/${repoOwner}/${repoName}/pulls?state=all&per_page=${perPage}&page=${page}`;
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'pms-github-integration',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: controller.signal,
    });

    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) {
        throw new Error('GitHub installation token was rejected while fetching PRs.');
      }
      if (resp.status === 404) {
        throw new Error('GitHub repository PRs endpoint not found.');
      }
      if (resp.status === 429) {
        throw new Error('GitHub API rate limit exceeded while fetching PRs.');
      }
      throw new Error(`Failed to list GitHub PRs (HTTP ${resp.status}).`);
    }

    const rawText = await resp.text();
    let data: any;
    try {
      data = parseJsonLossless(rawText);
    } catch {
      throw new Error('GitHub PRs response was not valid JSON.');
    }

    const prs = Array.isArray(data) ? data : [];
    const linkHeader = resp.headers.get('Link') || '';
    const hasNext = linkHeader.includes('rel="next"');

    const normalized: NormalizedPR[] = [];
    for (const raw of prs) {
      const githubPrId = toExactId(raw.id);
      if (!githubPrId) continue;

      const prNumber = toPositiveInt(raw.number);
      if (prNumber === null) continue;

      const title = toTextOrNull(raw.title) || '';
      if (!title) continue;

      const body = toTextOrNull(raw.body);
      const state = raw.state === 'closed' ? 'closed' : 'open';
      const draft = raw.draft === true;

      const headBranch = toTextOrNull(raw.head?.ref);
      const baseBranch = toTextOrNull(raw.base?.ref);
      const headSha = toTextOrNull(raw.head?.sha);
      const baseSha = toTextOrNull(raw.base?.sha);

      const author = raw.user && typeof raw.user === 'object' ? raw.user : null;
      const authorGithubId = toExactId(author?.id);
      const authorLogin = toTextOrNull(author?.login);

      const createdAtGithub = raw.created_at;
      const updatedAtGithub = raw.updated_at;
      const closedAtGithub = toIsoOrNull(raw.closed_at);
      const mergedAtGithub = toIsoOrNull(raw.merged_at);
      const htmlUrl = toTextOrNull(raw.html_url) || '';

      normalized.push({
        githubPrId,
        prNumber,
        title,
        body,
        state,
        draft,
        headBranch,
        baseBranch,
        headSha,
        baseSha,
        authorGithubId,
        authorLogin,
        createdAtGithub: raw.created_at,
        updatedAtGithub: raw.updated_at,
        closedAtGithub,
        mergedAtGithub,
        htmlUrl,
        syncRunId: undefined,
      });
    }

    return { prs: normalized, hasNext };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('Timed out while fetching GitHub PRs.');
    }
    if (err instanceof Error) throw err;
    throw new Error('Failed to list GitHub PRs.');
  } finally {
    clearTimeout(timeout);
  }
}

async function upsertPRSyncRun(
  client: PoolClientLike,
  installationId: string,
  repositoryId: string,
  syncRunId: string
): Promise<void> {
  await client.query(
    `INSERT INTO github_pr_sync_runs (
      installation_id, repository_id, sync_run_id, status,
      started_at, fetched_count, upserted_count, failed_count
    ) VALUES ($1, $2::bigint, $3, 'running', NOW(), 0, 0, 0)`,
    [installationId, repositoryId, syncRunId]
  );
}

async function finalizePRSyncRun(
  client: PoolClientLike,
  installationId: string,
  repositoryId: string,
  syncRunId: string,
  fetched: number,
  upserted: number,
  failed: number,
  lockToken: string,
  ownerId: string,
  status: 'complete' | 'truncated' | 'failed',
  errorMessage: string | null
): Promise<{ finalized: boolean; ownershipLost: boolean }> {
  try {
    const res = await client.query(
      `UPDATE github_pr_sync_runs
       SET status = $1, finished_at = NOW(),
           fetched_count = $2, upserted_count = $3, failed_count = $4,
           error_message = $5
        WHERE installation_id = $6
          AND repository_id = $7::bigint
          AND sync_run_id = $8
          AND EXISTS (
            SELECT 1 FROM github_installation_locks
            WHERE installation_id = $6
              AND lock_token = $9
              AND owner_id = $10
              AND expires_at > NOW()
          )
       RETURNING id`,
      [status, fetched, upserted, failed, errorMessage, installationId, repositoryId, syncRunId, lockToken, ownerId]
    );
    return { finalized: (res.rowCount ?? 0) > 0, ownershipLost: (res.rowCount ?? 0) === 0 };
  } catch (err) {
    throw new Error(`Finalization failed: ${sanitizeSyncError(err)}`);
  }
}

async function markPRSyncRunFailed(
  db: PoolLike,
  installationId: string,
  repositoryId: string,
  syncRunId: string,
  errorMessage: string,
  lockToken: string,
  ownerId: string
): Promise<{ finalized: boolean; ownershipLost: boolean }> {
  return withShortClient(db, async (client) => {
    try {
      const res = await client.query(
        `UPDATE github_pr_sync_runs
         SET status = 'failed', finished_at = NOW(), error_message = $1
          WHERE installation_id = $2
            AND repository_id = $3::bigint
            AND sync_run_id = $4
            AND EXISTS (
              SELECT 1 FROM github_installation_locks
              WHERE installation_id = $2
                AND lock_token = $5
                AND owner_id = $6
                AND expires_at > NOW()
            )
         RETURNING id`,
        [errorMessage, installationId, repositoryId, syncRunId, lockToken, ownerId]
      );
      return { finalized: (res.rowCount ?? 0) > 0, ownershipLost: (res.rowCount ?? 0) === 0 };
    } catch (err) {
      throw new Error(`Failed finalization failed: ${sanitizeSyncError(err)}`);
    }
  });
}

async function atomicFinalizePRSyncRun(
  db: PoolLike,
  installationId: string,
  repositoryId: string,
  syncRunId: string,
  fetched: number,
  upserted: number,
  failed: number,
  lockToken: string,
  ownerId: string,
  status: 'complete' | 'truncated' | 'failed',
  errors: string[]
): Promise<{ finalized: boolean; ownershipLost: boolean }> {
  const errorMessage = errors.length > 0 ? errors.join('; ') : null;
  const statusValue = status === 'truncated' ? 'truncated' : status === 'failed' ? 'failed' : 'complete';
  return withShortClient(db, (client) =>
    finalizePRSyncRun(client, installationId, repositoryId, syncRunId, fetched, upserted, failed, lockToken, ownerId, statusValue, errorMessage)
  );
}

export async function syncInstallationPRs(
  db: PoolLike,
  installationId: InstallationIdLike,
  repositoryId?: string
): Promise<PRSyncSummary> {
  const instId = normalizeInstallationId(installationId);
  const summary: PRSyncSummary = {
    installationId: instId,
    fetched: 0,
    upserted: 0,
    failed: 0,
    errors: [],
    truncated: false,
    complete: true,
    failedRepositories: 0,
    finalizationUncertain: false,
    renewalUncertain: false,
  };

  const lock = await withShortClient(db, (client) =>
    acquireInstallationLock(client, {
      installationId: instId,
      ownerId: `pr-sync:${instId}`,
      ttlMs: SYNC_LOCK_TTL_MS,
    })
  );

  if (!lock) {
    throw new Error('PR synchronization is already in progress for this installation.');
  }

  let ownershipLost = false;
  let renewalTimer: ReturnType<typeof setInterval> | null = null;
  let renewalPromise: Promise<void> | null = null;
  let cleanupStarted = false;

  const stopForOwnershipLoss = (message: string) => {
    if (ownershipLost) return;
    ownershipLost = true;
    summary.complete = false;
    if (summary.errors.length < 20 && !summary.errors.includes(message)) {
      summary.errors.push(message);
    }
  };

  const startRenewal = (currentLock: InstallationLock) => {
    renewalTimer = setInterval(() => {
      if (ownershipLost) return;
      if (summary.finalizationUncertain) return;
      if (summary.renewalUncertain) return;
      if (cleanupStarted) return;
      if (renewalPromise) return;
      renewalPromise = (async () => {
        try {
          const renewed = await withShortClient(db, (client) =>
            renewInstallationLock(client, currentLock, SYNC_LOCK_TTL_MS)
          );
          if (!renewed) {
            stopForOwnershipLoss('Lock ownership lost.');
          }
        } catch {
          summary.renewalUncertain = true;
        } finally {
          renewalPromise = null;
        }
      })();
    }, SYNC_LOCK_RENEW_INTERVAL_MS);
    (renewalTimer as any)?.unref?.();
  };

  try {
    await withShortClient(db, (client) => client.query(
      `UPDATE github_pr_sync_runs
       SET status = 'failed', finished_at = NOW(),
           error_message = 'Abandoned run recovered by subsequent sync'
     WHERE installation_id = $1
       AND status = 'running'
       AND started_at < NOW() - ($2 * INTERVAL '1 minute')
       AND EXISTS (
         SELECT 1 FROM github_installation_locks
         WHERE installation_id = $1
           AND lock_token = $3
           AND owner_id = $4
           AND expires_at > NOW()
       )`,
      [instId, STALE_THRESHOLD_MINUTES, lock.lockToken, lock.ownerId]
    ));

    startRenewal(lock);

    // If repositoryId is provided, validate it belongs to the installation
    let targetRepos: { github_repo_id: string; full_name: string }[] = [];
    
    if (repositoryId) {
      // Validate the repository belongs to this installation
      const repoRes = await withShortClient(db, (client) => client.query(
        `SELECT github_repo_id, full_name FROM github_repositories 
         WHERE installation_id = $1 AND github_repo_id = $2::bigint`,
        [instId, repositoryId]
      ));
      if (repoRes.rows.length === 0) {
        throw new Error('Repository not found for this installation.');
      }
      targetRepos = repoRes.rows;
    } else {
      // Sync all repositories for the installation
      const reposRes = await withShortClient(db, (client) => client.query(
        `SELECT github_repo_id, full_name FROM github_repositories WHERE installation_id = $1`,
        [instId]
      ));
      targetRepos = reposRes.rows;
    }

    for (const repo of targetRepos) {
      if (ownershipLost || summary.finalizationUncertain || summary.renewalUncertain) break;

      const syncRunId = crypto.randomUUID();
      let repoFailed = false;

      const countFailedRepositoryOnce = () => {
        if (!repoFailed) {
          repoFailed = true;
          summary.failedRepositories++;
        }
      };

      await withShortClient(db, (client) => client.query(
        `INSERT INTO github_pr_sync_runs (
          installation_id, repository_id, sync_run_id, status,
          started_at, fetched_count, upserted_count, failed_count
        ) VALUES ($1, $2::bigint, $3, 'running', NOW(), 0, 0, 0)`,
        [instId, repo.github_repo_id, syncRunId]
      ));

      // PHASE 1: PROCESSING with pagination
      let allPrs: NormalizedPR[] = [];
      let repoFetched = 0;
      let repoFailedCount = 0;
      let repoErrors: string[] = [];
      let repoTruncated = false;

      try {
        const { token } = await generateInstallationAccessToken(instId, false, true);

        if (ownershipLost || summary.finalizationUncertain || summary.renewalUncertain) break;

        // Pagination loop
        let page = 1;
        let hasMore = true;
        while (hasMore && !ownershipLost && !summary.finalizationUncertain && !summary.renewalUncertain) {
          if (page > PAGINATION_CAP_PAGES) {
            summary.truncated = true;
            break;
          }

          const { prs, hasNext } = await fetchPRPage(token, repo.full_name.split('/')[0], repo.full_name.split('/')[1], page, 100);
          allPrs.push(...prs);
          repoFetched += prs.length;
          hasMore = hasNext;
          page++;

          // If we've hit the cap but there are more pages, mark truncation
          if (page > PAGINATION_CAP_PAGES && hasMore) {
            summary.truncated = true;
            repoTruncated = true;
            break;
          }
        }

        if (ownershipLost) break;

        summary.fetched += repoFetched;

        const syncRunIdForUpsert = crypto.randomUUID();
        const upsertResult = await upsertPRBatch(db, instId, repo.github_repo_id, allPrs, syncRunIdForUpsert);
        summary.upserted += upsertResult.upserted;
        repoFailedCount = upsertResult.failed;

        summary.failed += repoFailedCount;

        let repoStatus: 'complete' | 'failed' | 'truncated';
        if (repoFailedCount > 0) {
          repoStatus = 'failed';
        } else if (repoTruncated) {
          repoStatus = 'truncated';
        } else {
          repoStatus = 'complete';
        }

        // PHASE 2: FINALIZATION
        if (repoStatus === 'complete' || repoStatus === 'truncated') {
          const result = await atomicFinalizePRSyncRun(
            db, instId, repo.github_repo_id, syncRunId,
            repoFetched, upsertResult.upserted, repoFailedCount,
            lock.lockToken, lock.ownerId,
            repoStatus, []
          );

          if (result.ownershipLost) {
            stopForOwnershipLoss(`Repo ${repo.full_name}: lost ownership.`);
          } else if (!result.finalized) {
            summary.finalizationUncertain = true;
            throw new Error(`Finalization failed for ${repo.full_name}`);
          }

        } else {
          const result = await markPRSyncRunFailed(
            db, instId, repo.github_repo_id, syncRunId,
            'Fetch or upsert failed',
            lock.lockToken, lock.ownerId
          );

          if (result.ownershipLost) {
            stopForOwnershipLoss(`Repo ${repo.full_name}: lost ownership.`);
          } else if (!result.finalized) {
            summary.finalizationUncertain = true;
            throw new Error(`Failed finalization failed for ${repo.full_name}`);
          }
        }

      } catch (procErr: any) {
        const safeMsg = sanitizeSyncError(procErr);
        console.error('GitHub PR sync repository failed:', safeMsg);
        if (summary.errors.length < 20) summary.errors.push(`repo ${repo.full_name}: ${safeMsg}`);

        try {
          const markResult = await markPRSyncRunFailed(
            db, instId, repo.github_repo_id, crypto.randomUUID(),
            sanitizeSyncError(procErr), lock.lockToken, lock.ownerId
          );
          if (markResult.ownershipLost) {
            stopForOwnershipLoss(`Repo ${repo.full_name}: lost ownership.`);
          } else if (!markResult.finalized) {
            summary.finalizationUncertain = true;
          }
        } catch (markErr) {
          summary.finalizationUncertain = true;
        }
        continue;
      }

    }

    summary.complete = !summary.truncated && !ownershipLost && !summary.finalizationUncertain && !summary.renewalUncertain && summary.failedRepositories === 0;
    return summary;

  } finally {
    if (renewalTimer) clearInterval(renewalTimer);
    if (renewalPromise) {
      try { await renewalPromise; } catch { /* ignore */ }
    }
    try {
      await withShortClient(db, (client) => releaseInstallationLock(client, lock));
    } catch (releaseErr) {
      console.warn('Lock release failed:', sanitizeSyncError(releaseErr));
    }
  }
}

export async function listInstallationPRs(
  client: PoolClientLike,
  installationId: InstallationIdLike
): Promise<any[]> {
  const instId = normalizeInstallationId(installationId);
  const res = await client.query(
    `SELECT
      id,
      installation_id::text AS installation_id,
      repository_id::text AS repository_id,
      github_pr_id,
      pr_number,
      title,
      body,
      state,
      draft,
      head_branch,
      base_branch,
      head_sha,
      base_sha,
      author_github_id,
      author_login,
      created_at_github,
      updated_at_github,
      closed_at_github,
      merged_at_github,
      html_url,
      last_synced_at,
      created_at,
      updated_at,
      sync_run_id
    FROM github_prs
    WHERE installation_id = $1
    ORDER BY repository_id ASC, pr_number ASC`,
    [instId]
  );
  return res.rows;
}