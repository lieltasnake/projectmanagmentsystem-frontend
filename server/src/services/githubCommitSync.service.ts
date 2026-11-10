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

export interface PoolClientLike {
  query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number }>;
  release?: () => void;
}

export interface PoolLike {
  connect: () => Promise<PoolClientLike>;
}

export interface CommitSyncSummary {
  installationId: string;
  fetched: number;
  upserted: number;
  failed: number;
  errors: string[];
  truncated: boolean;
  complete: boolean;
  ownershipLost: boolean;
  branchResults?: unknown[];
}

interface NormalizedCommit {
  sha: string;
  message: string;
  htmlUrl: string;
  authorLogin: string | null;
  authorName: string | null;
  authorEmail: string | null;
  authorAvatarUrl: string | null;
  authorDate: string | null;
  committerLogin: string | null;
  committerName: string | null;
  committerEmail: string | null;
  committerAvatarUrl: string | null;
  committerDate: string | null;
  treeSha: string;
  nodeId: string;
  syncRunId?: string;
}

const SYNC_LOCK_TTL_MS = 120_000;
const SYNC_LOCK_RENEW_INTERVAL_MS = 45_000;
const PAGINATION_CAP_PAGES = 100;

function toTextOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value);
  return s.length === 0 ? null : s;
}

function sanitizeSyncError(err: unknown): string {
  const msg = err instanceof Error && typeof err.message === 'string' ? err.message : 'sync error';
  return msg.slice(0, 120);
}

function generateSyncRunId(): string {
  return require('crypto').randomUUID();
}

function markIncomplete(summary: CommitSyncSummary, message: string): void {
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

async function upsertCommit(
  client: PoolClientLike,
  installationId: string,
  repositoryId: string,
  commit: NormalizedCommit,
  syncRunId: string
): Promise<void> {
  await client.query(
    `INSERT INTO github_commits (
       installation_id, repository_id, commit_sha, message, html_url,
       author_name, author_email, author_date,
       committer_name, committer_email, committer_date,
       last_synced_at
     ) VALUES (
       $1, $2::bigint, $3, $4, $5,
       $6, $7, $8, $9, $10, $11,
       NOW()
     )
     ON CONFLICT (installation_id, repository_id, commit_sha) DO UPDATE SET
       message = EXCLUDED.message,
       html_url = EXCLUDED.html_url,
       author_name = EXCLUDED.author_name,
       author_email = EXCLUDED.author_email,
       author_date = EXCLUDED.author_date,
       committer_name = EXCLUDED.committer_name,
       committer_email = EXCLUDED.committer_email,
       committer_date = EXCLUDED.committer_date,
       last_synced_at = NOW()`,
    [
      installationId,
      repositoryId,
      commit.sha,
      commit.message,
      commit.htmlUrl,
      commit.authorName,
      commit.authorEmail,
      commit.authorDate,
      commit.committerName,
      commit.committerEmail,
      commit.committerDate,
    ]
  );
}

async function upsertCommitBranch(
  client: PoolClientLike,
  installationId: string,
  repoId: string,
  branchName: string,
  commitSha: string,
  syncRunId: string
): Promise<void> {
  await client.query(
    `INSERT INTO github_commit_branches (
       installation_id, repository_id, commit_sha, branch_name,
       last_seen_at
     ) VALUES (
       $1, $2::bigint, $3, $4, NOW()
     )
     ON CONFLICT (installation_id, repository_id, commit_sha, branch_name) DO UPDATE SET
       last_seen_at = NOW()`,
    [installationId, repoId, commitSha, branchName]
  );
}

async function listRepositoryBranches(
  client: PoolClientLike,
  installationId: string,
  repoId: string
): Promise<any[]> {
const res = await client.query(
    `SELECT repository_id, branch_name, commit_sha
     FROM github_branches
     WHERE installation_id = $1
       AND repository_id = $2
     ORDER BY branch_name ASC`,
    [installationId, repoId]
  );
  return res.rows;
}

async function fetchCommitPage(
  token: string,
  repoOwner: string,
  repoName: string,
  branchName: string,
  page: number,
  perPage: number
): Promise<{ commits: NormalizedCommit[]; hasNext: boolean }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const url = `https://api.github.com/repos/${repoOwner}/${repoName}/commits?sha=${branchName}&per_page=${perPage}&page=${page}`;
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`, // installation token, never persisted/logged
        'User-Agent': 'pms-github-integration',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: controller.signal,
    });

    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) {
        throw new Error('GitHub installation token was rejected while fetching commits.');
      }
      if (resp.status === 404) {
        throw new Error('GitHub repository commits endpoint not found.');
      }
      if (resp.status === 429) {
        throw new Error('GitHub API rate limit exceeded while fetching commits.');
      }
      throw new Error(`Failed to list GitHub commits (HTTP ${resp.status}).`);
    }

    const rawText = await resp.text();
    let data: any;
    try {
      data = parseJsonLossless(rawText);
    } catch {
      throw new Error('GitHub commits response was not valid JSON.');
    }

     const commits = Array.isArray(data) ? data : [];
    const totalCount =
      typeof data?.total_count === 'number' && Number.isFinite(data.total_count)
        ? data.total_count
        : typeof data?.total_count === 'string' && /^\d+$/.test(data.total_count)
          ? Number(data.total_count)
          : commits.length;

    const normalized: NormalizedCommit[] = [];
    for (const raw of commits) {
      const sha = toTextOrNull(raw.sha);
      if (!sha) continue;

      const githubAuthor = raw.author && typeof raw.author === 'object' ? raw.author : null;
      const githubCommitter = raw.committer && typeof raw.committer === 'object' ? raw.committer : null;
      const commitAuthor = raw.commit?.author && typeof raw.commit.author === 'object' ? raw.commit.author : null;
      const commitCommitter = raw.commit?.committer && typeof raw.commit.committer === 'object' ? raw.commit.committer : null;

      let authorDate: string | null = null;
      if (commitAuthor?.date) {
        const d = Date.parse(commitAuthor.date);
        if (Number.isFinite(d)) authorDate = new Date(d).toISOString();
      }
      let committerDate: string | null = null;
      if (commitCommitter?.date) {
        const d = Date.parse(commitCommitter.date);
        if (Number.isFinite(d)) committerDate = new Date(d).toISOString();
      }

      normalized.push({
        sha,
        message: toTextOrNull(raw.commit?.message) || '',
        htmlUrl: toTextOrNull(raw.html_url) || '',
        authorLogin: toTextOrNull(githubAuthor?.login),
        authorName: toTextOrNull(commitAuthor?.name),
        authorEmail: toTextOrNull(commitAuthor?.email),
        authorAvatarUrl: toTextOrNull(githubAuthor?.avatar_url),
        authorDate,
        committerLogin: toTextOrNull(githubCommitter?.login),
        committerName: toTextOrNull(commitCommitter?.name),
        committerEmail: toTextOrNull(commitCommitter?.email),
        committerAvatarUrl: toTextOrNull(githubCommitter?.avatar_url),
        committerDate,
        treeSha: toTextOrNull(raw.tree?.sha) || '',
        nodeId: toTextOrNull(raw.node_id) || '',
        syncRunId: undefined,
      });
    }

    const hasNext = page * perPage < totalCount && commits.length === perPage;
    return { commits: normalized, hasNext };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('Timed out while fetching GitHub commits.');
    }
    if (err instanceof Error) throw err;
    throw new Error('Failed to list GitHub commits.');
  } finally {
    clearTimeout(timeout);
  }
}

export async function syncInstallationCommits(
  db: PoolLike,
  installationId: InstallationIdLike
): Promise<CommitSyncSummary> {
  const instId = normalizeInstallationId(installationId);
  const summary: CommitSyncSummary = {
    installationId: instId,
    fetched: 0,
    upserted: 0,
    failed: 0,
    errors: [],
    truncated: false,
    complete: true,
    ownershipLost: false,
    branchResults: [],
  };

  const lock = await withShortClient(db, (client) =>
    acquireInstallationLock(client, {
      installationId: instId,
      ownerId: `commit-sync:${instId}`,
      ttlMs: SYNC_LOCK_TTL_MS,
    })
  );

  if (!lock) {
    throw new Error('Commit synchronization is already in progress for this installation.');
  }

  let ownershipLost = false;
  let renewalTimer: ReturnType<typeof setInterval> | null = null;
  let renewalInFlight = false;

  const stopForOwnershipLoss = (message: string) => {
    if (ownershipLost) return;
    ownershipLost = true;
    markIncomplete(summary, message);
  };

  const startRenewal = (currentLock: InstallationLock) => {
    renewalTimer = setInterval(() => {
      if (renewalInFlight || ownershipLost) return;
      renewalInFlight = true;
      void withShortClient(db, (client) => renewInstallationLock(client, currentLock, SYNC_LOCK_TTL_MS))
        .then((renewed) => {
          if (!renewed) {
            stopForOwnershipLoss('Commit synchronization stopped because installation lock ownership was lost.');
          }
        })
        .catch(() => {
          stopForOwnershipLoss('Commit synchronization stopped because installation lock renewal failed.');
        })
        .finally(() => {
          renewalInFlight = false;
        });
    }, SYNC_LOCK_RENEW_INTERVAL_MS);
    (renewalTimer as any)?.unref?.();
  };

  try {
    startRenewal(lock);

    const { token } = await generateInstallationAccessToken(instId, true);

    if (ownershipLost) return summary;

    const reposRes = await withShortClient(db, (client) => client.query(
      `SELECT github_repo_id, full_name, default_branch FROM github_repositories WHERE installation_id = $1`,
      [instId]
    ));
    const repos = reposRes.rows;

    const successfulRepos = new Set<string>();

    for (const repo of repos) {
      if (ownershipLost) break;

      const [repoOwner, repoName] = repo.full_name.split('/');
      if (!repoOwner || !repoName) {
        summary.failed++;
        if (summary.errors.length < 20) {
          summary.errors.push(`repo ${repo.full_name}: invalid full_name format`);
        }
        continue;
      }

      const _defaultBranch = repo.default_branch || 'main';

      const branchRes = await withShortClient(db, (client) =>
        listRepositoryBranches(client, instId, repo.github_repo_id)
      );

      if (ownershipLost) break;

      if (branchRes.length === 0) {
        if (summary.errors.length < 20 && !summary.errors.includes(`repo ${repo.full_name}: no branches found`)) {
          summary.errors.push(`repo ${repo.full_name}: no branches found`);
        }
        continue;
      }

      const syncRunId = generateSyncRunId();
      let repoSuccessful = false;

      for (const branch of branchRes) {
        if (ownershipLost) break;

        const perPage = 100;
        let page = 1;
        let hasNext = true;

        while (hasNext) {
          if (ownershipLost) break;
          if (page > PAGINATION_CAP_PAGES) {
            markIncomplete(summary, 'Pagination limit reached; commit sync truncated.');
            break;
          }

          try {
            const { commits, hasNext: next } = await fetchCommitPage(
              token,
              repoOwner,
              repoName,
              branch.branch_name,
              page,
              perPage
            );
            summary.fetched += commits.length;

            for (const commit of commits) {
              if (ownershipLost) break;
              commit.syncRunId = syncRunId;

              try {
                await withShortClient(db, (client) =>
                  upsertCommit(client, instId, repo.github_repo_id, commit, syncRunId)
                );
                summary.upserted++;
              } catch (err: any) {
                summary.failed++;
                if (summary.errors.length < 20) {
                  summary.errors.push(
                    `repo ${repo.full_name}, branch ${branch.branch_name}, commit ${commit.sha}: ${sanitizeSyncError(err)}`
                  );
                }
              }
            }

            hasNext = next;
            page++;
            repoSuccessful = true;
          } catch (err: any) {
            summary.failed++;
            if (summary.errors.length < 20) {
              summary.errors.push(`repo ${repo.full_name}, branch ${branch.branch_name}: ${sanitizeSyncError(err)}`);
            }
            break;
          }
        }
      }

      if (repoSuccessful) {
        successfulRepos.add(repo.github_repo_id);
      }
    }

    if (!ownershipLost) {
      for (const repo of repos) {
        if (ownershipLost) break;
if (successfulRepos.has(repo.github_repo_id)) {
            const branchRes = await withShortClient(db, (client) =>
              listRepositoryBranches(client, instId, repo.github_repo_id)
            );
            const syncRunId = generateSyncRunId();

            for (const branch of branchRes) {
              if (ownershipLost) break;
              await withShortClient(db, (client) =>
                upsertCommitBranch(client, instId, repo.github_repo_id, branch.branch_name, branch.commit_sha, syncRunId)
              );
            }
        }
      }
    }

return {
    ...summary,
    ownershipLost,
    branchResults: [],
  };
  } finally {
    if (renewalTimer) clearInterval(renewalTimer);
    await withShortClient(db, (client) => releaseInstallationLock(client, lock)).catch(() => {});
  }
}

export async function listInstallationCommits(
  client: PoolClientLike,
  installationId: InstallationIdLike
): Promise<any[]> {
  const instId = normalizeInstallationId(installationId);
  const res = await client.query(
      `SELECT
        id,
        installation_id::text AS installation_id,
        repository_id::text AS repository_id,
        commit_sha,
        message,
        html_url,
        author_name,
        author_email,
        author_date,
        committer_name,
        committer_email,
        committer_date,
        last_synced_at
      FROM github_commits
      WHERE installation_id = $1
      ORDER BY repository_id ASC, commit_sha ASC`,
    [instId]
  );
  return res.rows;
}

export async function listSyncRunStatus(
  client: PoolClientLike,
  installationId: InstallationIdLike
): Promise<any[]> {
  const instId = normalizeInstallationId(installationId);
  const res = await client.query(
      `SELECT
        id,
        installation_id::text AS installation_id,
        repository_id::text AS repository_id,
        branch_name,
        sync_run_id,
        status,
        started_at,
        finished_at,
        fetched_count,
        upserted_count,
        failed_count,
        error_message
      FROM github_commit_sync_runs
      WHERE installation_id = $1
      ORDER BY started_at DESC`,
    [instId]
  );
  return res.rows;
}