import { Router, Response } from 'express';
import { pool } from '../db';
import { authenticateToken, requirePM, AuthenticatedRequest } from '../middleware/auth';
import { canonicalInstallationLockKey, normalizeInstallationId, normalizeUserId } from '../services/installationLock.service';
import { syncInstallationPRs, listInstallationPRs } from '../services/githubPRSync.service';

const router = Router();

const SYNC_ERROR_ALLOWLIST = new Set([
  'PR synchronization is already in progress for this installation.',
  'GitHub installation not found or not accessible to this App.',
  'GitHub installation repositories endpoint not found.',
  'GitHub API rate exceeded while listing repositories.',
  'GitHub API rate limit exceeded while requesting installation token.',
  'Timed out while listing GitHub repositories.',
  'Timed out while requesting GitHub installation token.',
  'GitHub App authentication failed when requesting installation token.',
  'GitHub App does not have sufficient permission to read repository metadata and/or pull requests for this installation.',
  'repository metadata token for this installation. Verify the installation grants repository metadata and branch access.',
  'GitHub installation token was rejected while listing repositories.',
  'Pull request metadata schema not yet initialized. Apply the approved migration first.',
  'Repository not found for this installation.',
]);

function safeSyncApiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : '';
  return SYNC_ERROR_ALLOWLIST.has(msg) ? msg : 'Pull request synchronization failed.';
}

/**
 * Resolves an installation by canonical external GitHub installation ID.
 * PM-as-administrator policy: any authenticated PM may manage all installations
 * (TL/TM/TESTER blocked by requirePM). Role/is_active checks follow existing
 * installation route conventions.
 */
async function resolveActiveInstallation(
  client: any,
  installationIdParam: string,
  req: AuthenticatedRequest
): Promise<
  | { ok: true; githubInstallationId: string; userId: string; role: string }
  | { ok: false; status: number; error: string }
> {
  let userId: string;
  let installationId: string;
  try {
    userId = normalizeUserId(req.user?.id as any);
    installationId = normalizeInstallationId(installationIdParam);
  } catch {
    return { ok: false, status: 400, error: 'Invalid request.' };
  }

  const schemaRes = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_name = 'github_installations' AND table_type = 'BASE TABLE'
     LIMIT 1`
  );
  if (schemaRes.rows.length === 0) {
    return { ok: false, status: 503, error: 'GitHub integration schema not yet initialized.' };
  }

  // M6: lookup by external installation_id only (no ambiguous id OR installation_id).
  const instRes = await client.query(
    `SELECT id, installation_id, pm_user_id, is_active
     FROM github_installations
     WHERE installation_id = $1
     LIMIT 1`,
    [installationId]
  );
  if (instRes.rows.length === 0) {
    return { ok: false, status: 404, error: 'GitHub installation not found.' };
  }

  const inst = instRes.rows[0];
  const role = String(req.user?.role || '').toUpperCase();
  const instPmUserId = inst.pm_user_id != null ? String(inst.pm_user_id).trim() : null;

  // PM-as-administrator policy: PMs may manage all installations.
  if (role !== 'PM' && instPmUserId !== userId) {
    return { ok: false, status: 403, error: 'Forbidden: You do not own this GitHub installation.' };
  }
  if (!inst.is_active) {
    return { ok: false, status: 410, error: 'GitHub installation is no longer active.' };
  }

  let githubInstallationId: string;
  try {
    githubInstallationId = canonicalInstallationLockKey(inst.installation_id);
  } catch {
    return { ok: false, status: 400, error: 'Invalid installation ID.' };
  }

  return { ok: true, githubInstallationId, userId, role };
}

/**
 * POST /api/github/installation/:installationId/repositories/:repositoryId/pull-requests/sync
 * PM-only. Synchronizes pull request metadata for a specific repository under the installation
 * using a short-lived GitHub installation access token (never persisted or exposed).
 * Uses installation lock to prevent concurrent syncs. Returns a safe summary (no tokens/credentials).
 */
router.post(
  '/:installationId/repositories/:repositoryId/pull-requests/sync',
  authenticateToken,
  requirePM,
  async (req: AuthenticatedRequest, res: Response) => {
    // Short DB operation for authorization and schema checks; do not hold a pooled
    // connection during GitHub API pagination (sync service manages short DB ops).
    let githubInstallationId: string;
    let repositoryId: string;
    {
      const client = await pool.connect();
      try {
        const resolved = await resolveActiveInstallation(client, String(req.params.installationId), req);
        if (!resolved.ok) {
          return res.status(resolved.status).json({ success: false, error: resolved.error });
        }

        // Validate repository ID format
        try {
          repositoryId = normalizeInstallationId(String(req.params.repositoryId));
        } catch {
          return res.status(400).json({ success: false, error: 'Invalid repository ID.' });
        }

        // Verify the repository belongs to this installation
        const repoCheck = await client.query(
          `SELECT github_repo_id FROM github_repositories 
           WHERE installation_id = $1 AND github_repo_id = $2::bigint
           LIMIT 1`,
          [resolved.githubInstallationId, repositoryId]
        );
        if (repoCheck.rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Repository not found for this installation.' });
        }

        // Ensure PR tables exist before sync (additive check; no DDL execution).
        const prTable = await client.query(
          `SELECT 1 FROM information_schema.tables
           WHERE table_schema = current_schema() AND table_name = 'github_prs' AND table_type = 'BASE TABLE'
           LIMIT 1`
        );
        if (prTable.rows.length === 0) {
          return res.status(503).json({
            success: false,
            error: 'Pull request metadata schema not yet initialized. Apply the approved migration first.',
          });
        }

        githubInstallationId = resolved.githubInstallationId;
      } finally {
        client.release();
      }
    }

    try {
      const summary = await syncInstallationPRs(pool, githubInstallationId, repositoryId);
      const incomplete = summary.truncated || summary.complete === false;
      return res.status(200).json({
        success: !incomplete,
        message: incomplete
          ? 'Pull request synchronization completed with incomplete results.'
          : 'Pull request metadata synchronized.',
        summary: {
          installationId: summary.installationId,
          repositoryId,
          fetched: summary.fetched,
          upserted: summary.upserted,
          failed: summary.failed,
          truncated: summary.truncated === true,
          complete: summary.complete !== false,
          errors: summary.errors, // sanitized; never includes tokens
        },
      });
    } catch (err: unknown) {
      const safe = safeSyncApiError(err);
      console.error('GitHub pull request sync failed.');
      return res.status(500).json({ success: false, error: safe });
    }
  }
);

/**
 * GET /api/github/installation/:installationId/repositories/:repositoryId/pull-requests
 * PM-only. Returns stored pull request metadata for a specific repository under the installation
 * (no GitHub API call). Supports pagination via page and per_page query parameters.
 */
router.get(
  '/:installationId/repositories/:repositoryId/pull-requests',
  authenticateToken,
  requirePM,
  async (req: AuthenticatedRequest, res: Response) => {
    const client = await pool.connect();
    try {
      const resolved = await resolveActiveInstallation(client, String(req.params.installationId), req);
      if (!resolved.ok) {
        return res.status(resolved.status).json({ success: false, error: resolved.error });
      }

      // Validate repository ID format
      let repositoryId: string;
      try {
        repositoryId = normalizeInstallationId(String(req.params.repositoryId));
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid repository ID.' });
      }

      // Verify the repository belongs to this installation
      const repoCheck = await client.query(
        `SELECT github_repo_id FROM github_repositories 
         WHERE installation_id = $1 AND github_repo_id = $2::bigint
         LIMIT 1`,
        [resolved.githubInstallationId, repositoryId]
      );
      if (repoCheck.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Repository not found for this installation.' });
      }

      const prTable = await client.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = current_schema() AND table_name = 'github_prs' AND table_type = 'BASE TABLE'
         LIMIT 1`
      );
      if (prTable.rows.length === 0) {
        return res.status(503).json({
          success: false,
          error: 'Pull request metadata schema not yet initialized. Apply the approved migration first.',
        });
      }

      // Pagination parameters with validation
      const page = Math.max(1, parseInt(typeof req.query.page === 'string' ? req.query.page : '1', 10));
      const per_page = Math.min(100, Math.max(1, parseInt(typeof req.query.per_page === 'string' ? req.query.per_page : '50', 10)));
      const offset = (page - 1) * per_page;

      // Get total count for pagination metadata
      const countRes = await client.query(
        `SELECT COUNT(*) FROM github_prs 
         WHERE installation_id = $1 AND repository_id = $2::bigint`,
        [resolved.githubInstallationId, repositoryId]
      );
      const totalCount = parseInt(countRes.rows[0]?.count || '0', 10);
      const totalPages = Math.ceil(totalCount / per_page);

      const prs = await client.query(
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
           updated_at
         FROM github_prs
        WHERE installation_id = $1 AND repository_id = $2::bigint
        ORDER BY pr_number ASC
        LIMIT $3 OFFSET $4`,
        [resolved.githubInstallationId, repositoryId, per_page, offset]
      );

      return res.status(200).json({
        success: true,
        installationId: resolved.githubInstallationId,
        repositoryId,
        count: prs.rows.length,
        totalCount,
        page,
        per_page,
        totalPages,
        pullRequests: prs.rows,
      });
    } catch {
      // M3: never log raw database/driver errors, tokens, or connection details.
      console.error('GitHub pull request list failed.');
      return res.status(500).json({ success: false, error: 'Failed to list pull requests.' });
    } finally {
      client.release();
    }
  }
);

/**
 * GET /api/github/installation/:installationId/repositories/:repositoryId/pull-requests/status
 * PM-only. Returns stored synchronization run status for a specific repository.
 */
router.get(
  '/:installationId/repositories/:repositoryId/pull-requests/status',
  authenticateToken,
  requirePM,
  async (req: AuthenticatedRequest, res: Response) => {
    const client = await pool.connect();
    try {
      const resolved = await resolveActiveInstallation(client, String(req.params.installationId), req);
      if (!resolved.ok) {
        return res.status(resolved.status).json({ success: false, error: resolved.error });
      }

      // Validate repository ID format
      let repositoryId: string;
      try {
        repositoryId = normalizeInstallationId(String(req.params.repositoryId));
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid repository ID.' });
      }

      // Verify the repository belongs to this installation
      const repoCheck = await client.query(
        `SELECT github_repo_id FROM github_repositories 
         WHERE installation_id = $1 AND github_repo_id = $2::bigint
         LIMIT 1`,
        [resolved.githubInstallationId, repositoryId]
      );
      if (repoCheck.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Repository not found for this installation.' });
      }

      const syncRunsTable = await client.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = current_schema() AND table_name = 'github_pr_sync_runs' AND table_type = 'BASE TABLE'
         LIMIT 1`
      );
      if (syncRunsTable.rows.length === 0) {
        return res.status(503).json({
          success: false,
          error: 'Pull request sync status schema not yet initialized. Apply the approved migration first.',
        });
      }

      const runs = await client.query(
        `SELECT
          id,
          installation_id::text AS installation_id,
          repository_id::text AS repository_id,
          sync_run_id,
          status,
          started_at,
          finished_at,
          fetched_count,
          upserted_count,
          failed_count,
          error_message
        FROM github_pr_sync_runs
        WHERE installation_id = $1 AND repository_id = $2::bigint
        ORDER BY started_at DESC
        LIMIT 50`,
        [resolved.githubInstallationId, repositoryId]
      );

      return res.status(200).json({
        success: true,
        installationId: resolved.githubInstallationId,
        repositoryId,
        count: runs.rows.length,
        runs: runs.rows,
      });
    } catch {
      console.error('GitHub pull request sync status failed.');
      return res.status(500).json({ success: false, error: 'Failed to list sync status.' });
    } finally {
      client.release();
    }
  }
);

export default router;