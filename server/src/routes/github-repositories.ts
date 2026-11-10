import { Router, Response } from 'express';
import { pool } from '../db';
import { authenticateToken, requirePM, AuthenticatedRequest } from '../middleware/auth';
import { canonicalInstallationLockKey, normalizeInstallationId, normalizeUserId } from '../services/installationLock.service';
import { listInstallationRepositories, syncInstallationRepositories } from '../services/githubRepositorySync.service';

const router = Router();

const SYNC_ERROR_ALLOWLIST = new Set([
  'Repository synchronization is already in progress for this installation.',
  'GitHub installation not found or not accessible to this App.',
  'GitHub installation repositories endpoint not found.',
  'GitHub API rate limit exceeded while listing repositories.',
  'GitHub API rate limit exceeded while requesting installation token.',
  'Timed out while listing GitHub repositories.',
  'Timed out while requesting GitHub installation token.',
  'GitHub App authentication failed when requesting installation token.',
  'GitHub App does not have sufficient permission to read repository metadata for this installation.',
  'GitHub could not issue a repository metadata token for this installation. Verify the installation grants repository metadata access.',
  'GitHub installation token was rejected while listing repositories.',
  'Repository metadata schema not yet initialized. Apply the approved migration first.',
]);

function safeSyncApiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : '';
  return SYNC_ERROR_ALLOWLIST.has(msg) ? msg : 'Repository synchronization failed.';
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
 * POST /api/github/installation/:installationId/repositories/sync
 * PM-only. Synchronizes repository metadata for the installation using a short-lived
 * GitHub installation access token (never persisted or exposed). Uses installation
 * lock to prevent concurrent syncs. Returns a safe summary (no tokens/credentials).
 */
router.post(
  '/:installationId/repositories/sync',
  authenticateToken,
  requirePM,
  async (req: AuthenticatedRequest, res: Response) => {
    // Short DB operation for authorization and schema checks; do not hold a pooled
    // connection during GitHub API pagination (sync service manages short DB ops).
    let githubInstallationId: string;
    {
      const client = await pool.connect();
      try {
        const resolved = await resolveActiveInstallation(client, String(req.params.installationId), req);
        if (!resolved.ok) {
          return res.status(resolved.status).json({ success: false, error: resolved.error });
        }

        // Ensure repository table exists before sync (additive check; no DDL execution).
        const repoTable = await client.query(
          `SELECT 1 FROM information_schema.tables
           WHERE table_schema = current_schema() AND table_name = 'github_repositories' AND table_type = 'BASE TABLE'
           LIMIT 1`
        );
        if (repoTable.rows.length === 0) {
          return res.status(503).json({
            success: false,
            error: 'Repository metadata schema not yet initialized. Apply the approved migration first.',
          });
        }
        githubInstallationId = resolved.githubInstallationId;
      } finally {
        client.release();
      }
    }

    try {
      const summary = await syncInstallationRepositories(pool, githubInstallationId);
      const incomplete = summary.truncated || summary.complete === false;
      return res.status(200).json({
        success: !incomplete,
        message: incomplete
          ? 'Repository metadata synchronization completed with incomplete results.'
          : 'Repository metadata synchronized.',
        summary: {
          installationId: summary.installationId,
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
      console.error('GitHub repository sync failed.');
      return res.status(500).json({ success: false, error: safe });
    }
  }
);

/**
 * GET /api/github/installation/:installationId/repositories
 * PM-only. Returns stored repository metadata for the installation (no GitHub API call).
 * Repository IDs are returned as strings to preserve BIGINT precision.
 */
router.get(
  '/:installationId/repositories',
  authenticateToken,
  requirePM,
  async (req: AuthenticatedRequest, res: Response) => {
    const client = await pool.connect();
    try {
      const resolved = await resolveActiveInstallation(client, String(req.params.installationId), req);
      if (!resolved.ok) {
        return res.status(resolved.status).json({ success: false, error: resolved.error });
      }

      const repoTable = await client.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = current_schema() AND table_name = 'github_repositories' AND table_type = 'BASE TABLE'
         LIMIT 1`
      );
      if (repoTable.rows.length === 0) {
        return res.status(503).json({
          success: false,
          error: 'Repository metadata schema not yet initialized. Apply the approved migration first.',
        });
      }

      const repositories = await listInstallationRepositories(client, resolved.githubInstallationId);
      return res.status(200).json({
        success: true,
        installationId: resolved.githubInstallationId,
        count: repositories.length,
        repositories,
      });
    } catch {
      // M3: never log raw database/driver errors, tokens, or connection details.
      console.error('GitHub repository list failed.');
      return res.status(500).json({ success: false, error: 'Failed to list repositories.' });
    } finally {
      client.release();
    }
  }
);

export default router;
