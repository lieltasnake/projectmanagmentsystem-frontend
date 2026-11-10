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

async function withShortClient<T>(db: PoolLike, fn: (client: PoolClientLike) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    return await fn(client);
  } finally {
    client.release?.();
  }
}

export interface PoolClientLike {
  query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number }>;
  release?: () => void;
}

export interface PoolLike {
  connect: () => Promise<PoolClientLike>;
}

export interface RepoSyncSummary {
  installationId: string;
  fetched: number;
  upserted: number;
  failed: number;
  errors: string[];
  truncated: boolean;
  complete: boolean;
}

interface NormalizedRepository {
  githubRepoId: string; // exact decimal string
  name: string;
  fullName: string;
  ownerLogin: string | null;
  private: boolean;
  defaultBranch: string | null;
  htmlUrl: string | null;
  description: string | null;
  archived: boolean;
  githubCreatedAt: string | null; // ISO or null
  githubUpdatedAt: string | null; // ISO or null
}

const SYNC_LOCK_TTL_MS = 120_000;
const SYNC_LOCK_RENEW_INTERVAL_MS = 45_000;
const PAGINATION_CAP_PAGES = 100;

/**
 * Converts a GitHub API ID value (possibly string from lossless parse, number, or bigint)
 * to an exact decimal string. Returns null if invalid.
 */
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

function toIsoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function toTextOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value);
  return s.length === 0 ? null : s;
}

function sanitizeSyncError(err: unknown): string {
  const msg = err instanceof Error && typeof err.message === 'string' ? err.message : 'sync error';
  return msg.slice(0, 120);
}

/**
 * Normalizes a GitHub repository object from the API into the fields we persist.
 * Requires an exact repository ID; returns null for invalid entries.
 */
function normalizeRepo(raw: any): NormalizedRepository | null {
  if (!raw || typeof raw !== 'object') return null;
  const githubRepoId = toExactId(raw.id);
  if (!githubRepoId) return null;

  const name = toTextOrNull(raw.name);
  const fullName = toTextOrNull(raw.full_name);
  if (!name || !fullName) return null;

  const owner = raw.owner && typeof raw.owner === 'object' ? raw.owner : null;
  const ownerLogin = owner ? toTextOrNull(owner.login) : null;

  return {
    githubRepoId,
    name,
    fullName,
    ownerLogin,
    private: raw.private === true,
    defaultBranch: toTextOrNull(raw.default_branch),
    htmlUrl: toTextOrNull(raw.html_url),
    description: toTextOrNull(raw.description),
    archived: raw.archived === true,
    githubCreatedAt: toIsoOrNull(raw.created_at),
    githubUpdatedAt: toIsoOrNull(raw.updated_at),
  };
}

/**
 * Fetches a single page of installation repositories using an installation access token.
 * Parses the response body losslessly to preserve BIGINT IDs.
 */
async function fetchReposPage(
  token: string,
  page: number,
  perPage: number
): Promise<{ repos: NormalizedRepository[]; hasNext: boolean }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const url = `https://api.github.com/installation/repositories?per_page=${perPage}&page=${page}`;
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
        throw new Error('GitHub installation token was rejected while listing repositories.');
      }
      if (resp.status === 404) {
        throw new Error('GitHub installation repositories endpoint not found.');
      }
      if (resp.status === 429) {
        throw new Error('GitHub API rate limit exceeded while listing repositories.');
      }
      throw new Error(`Failed to list GitHub repositories (HTTP ${resp.status}).`);
    }

    const rawText = await resp.text();
    let data: any;
    try {
      data = parseJsonLossless(rawText);
    } catch {
      throw new Error('GitHub repository response was not valid JSON.');
    }

    const repositories = Array.isArray(data?.repositories) ? data.repositories : [];
    const totalCount =
      typeof data?.total_count === 'number' && Number.isFinite(data.total_count)
        ? data.total_count
        : typeof data?.total_count === 'string' && /^\d+$/.test(data.total_count)
          ? Number(data.total_count)
          : repositories.length;

    const repos: NormalizedRepository[] = [];
    for (const raw of repositories) {
      const n = normalizeRepo(raw);
      if (n) repos.push(n);
    }

    const hasNext = page * perPage < totalCount && repositories.length === perPage;
    return { repos, hasNext };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('Timed out while listing GitHub repositories.');
    }
    if (err instanceof Error) throw err;
    throw new Error('Failed to list GitHub repositories.');
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Upserts repository metadata for an installation.
 * - Unique on (installation_id, github_repo_id)
 * - Updates mutable metadata + last_synced_at on conflict
 * - Never deletes repositories missing from the sync response
 */
async function upsertRepository(
  client: PoolClientLike,
  installationId: string,
  repo: NormalizedRepository
): Promise<void> {
  await client.query(
    `INSERT INTO github_repositories (
       installation_id, github_repo_id, name, full_name, owner_login,
       private, default_branch, html_url, description, archived,
       github_created_at, github_updated_at, last_synced_at, updated_at
     ) VALUES (
       $1, $2::bigint, $3, $4, $5,
       $6, $7, $8, $9, $10,
       $11::timestamptz, $12::timestamptz, NOW(), NOW()
     )
     ON CONFLICT (installation_id, github_repo_id) DO UPDATE SET
       name = EXCLUDED.name,
       full_name = EXCLUDED.full_name,
       owner_login = EXCLUDED.owner_login,
       private = EXCLUDED.private,
       default_branch = EXCLUDED.default_branch,
       html_url = EXCLUDED.html_url,
       description = EXCLUDED.description,
       archived = EXCLUDED.archived,
       github_created_at = COALESCE(EXCLUDED.github_created_at, github_repositories.github_created_at),
       github_updated_at = EXCLUDED.github_updated_at,
       last_synced_at = NOW(),
       updated_at = NOW()`,
    [
      installationId,
      repo.githubRepoId,
      repo.name,
      repo.fullName,
      repo.ownerLogin,
      repo.private,
      repo.defaultBranch,
      repo.htmlUrl,
      repo.description,
      repo.archived,
      repo.githubCreatedAt,
      repo.githubUpdatedAt,
    ]
  );
}



async function upsertRepoBatch(
  db: PoolLike,
  installationId: string,
  repos: NormalizedRepository[],
  summary: RepoSyncSummary,
  ownershipLost: boolean
): Promise<void> {
  if (repos.length === 0) return;
  await withShortClient(db, async (client) => {
    for (const repo of repos) {
      if (ownershipLost) break;
      try {
        await upsertRepository(client, installationId, repo);
        summary.upserted++;
      } catch (err: unknown) {
        summary.failed++;
        if (summary.errors.length < 20) {
          summary.errors.push(`repo ${repo.fullName || repo.githubRepoId}: ${sanitizeSyncError(err)}`);
        }
      }
    }
  });
}

function markIncomplete(summary: RepoSyncSummary, message: string): void {
  summary.truncated = true;
  summary.complete = false;
  if (summary.errors.length < 20 && !summary.errors.includes(message)) {
    summary.errors.push(message);
  }
}

/**
 * Synchronizes repository metadata for a GitHub installation.
 *
 * - Requires an active installation record (checked by caller/route).
 * - Acquires installation lock with exact installation ID/owner/token ownership.
 * - Renews lock with exact ownership checks (DB time) while network sync runs.
 * - Stops safely on renewal/ownership loss; never takes over another worker's lock.
 * - Releases lock in finally.
 * - Generates a short-lived installation access token (never persisted).
 * - Paginates through accessible repositories without holding a pooled DB client.
 * - Uses short DB operations for lock and repository upserts.
 * - Upserts metadata without creating duplicates; never deletes missing repos.
 * - Reports truncation explicitly when pagination safety cap is reached.
 */
export async function syncInstallationRepositories(
  db: PoolLike,
  installationId: InstallationIdLike
): Promise<RepoSyncSummary> {
  const instId = normalizeInstallationId(installationId);
  const summary: RepoSyncSummary = {
    installationId: instId,
    fetched: 0,
    upserted: 0,
    failed: 0,
    errors: [],
    truncated: false,
    complete: true,
  };

  const lock = await withShortClient(db, (client) =>
    acquireInstallationLock(client, {
      installationId: instId,
      ownerId: `repo-sync:${instId}`,
      ttlMs: SYNC_LOCK_TTL_MS,
    })
  );

  if (!lock) {
    throw new Error('Repository synchronization is already in progress for this installation.');
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
            stopForOwnershipLoss('Repository synchronization stopped because installation lock ownership was lost.');
          }
        })
        .catch(() => {
          // Renewal uses a short DB operation; any failure is treated as unsafe to continue.
          stopForOwnershipLoss('Repository synchronization stopped because installation lock renewal failed.');
        })
        .finally(() => {
          renewalInFlight = false;
        });
    }, SYNC_LOCK_RENEW_INTERVAL_MS);
    (renewalTimer as any)?.unref?.();
  };

  try {
    startRenewal(lock);

    // Generate short-lived token (never persisted/logged/exposed). No pooled DB client held.
    const { token } = await generateInstallationAccessToken(instId);

    if (ownershipLost) return summary;

    const perPage = 100;
    let page = 1;
    let hasNext = true;

    while (hasNext) {
      if (ownershipLost) break;
      if (page > PAGINATION_CAP_PAGES) {
        markIncomplete(summary, 'Pagination limit reached; synchronization incomplete.');
        break;
      }

      const { repos, hasNext: next } = await fetchReposPage(token, page, perPage);
      summary.fetched += repos.length;

      if (ownershipLost) break;
      await upsertRepoBatch(db, instId, repos, summary, ownershipLost);

      hasNext = next;
      page++;
    }
  } finally {
    if (renewalTimer) clearInterval(renewalTimer);
    // Final renewal attempt is not performed after work stops; release only exact owner/token.
    await withShortClient(db, (client) => releaseInstallationLock(client, lock)).catch(() => {});
  }

  return summary;
}

/**
 * Lists stored repository metadata for an installation (no GitHub API call).
 * Returns github_repo_id as a string to preserve BIGINT precision.
 */
export async function listInstallationRepositories(
  client: PoolClientLike,
  installationId: InstallationIdLike
): Promise<any[]> {
  const instId = normalizeInstallationId(installationId);
  const res = await client.query(
    `SELECT
       id,
       installation_id::text AS installation_id,
       github_repo_id::text AS github_repo_id,
       name,
       full_name,
       owner_login,
       private,
       default_branch,
       html_url,
       description,
       archived,
       github_created_at,
       github_updated_at,
       last_synced_at,
       created_at,
       updated_at
     FROM github_repositories
     WHERE installation_id = $1
     ORDER BY full_name ASC, github_repo_id ASC`,
    [instId]
  );
  return res.rows;
}
