import { Router, Response } from 'express';
import { pool } from '../db';
import { authenticateToken, requirePM, AuthenticatedRequest } from '../middleware/auth';
import { canonicalInstallationLockKey, normalizeInstallationId, normalizeUserId } from '../services/installationLock.service';
import { syncInstallationBranches, listInstallationBranches } from '../services/githubBranchSync.service';

const router = Router();

const SYNC_ERROR_ALLOWLIST = new Set([
  'Branch synchronization is already in progress for this installation.',
  'GitHub installation not found or not accessible to this App.',
  'GitHub installation repositories endpoint not found.',
  'GitHub API rate limit exceeded while listing repositories.',
  'GitHub API rate limit exceeded while requesting installation token.',
  'Timed out while listing GitHub repositories.',
  'Timed out while requesting GitHub installation token.',
  'GitHub App authentication failed when requesting installation token.',
  'GitHub App does not have sufficient permission to read repository metadata and/or branches for this installation.',
  'GitHub could not issue a repository metadata and/or branch token for this installation. Verify the installation grants repository metadata and branch access.',
  'GitHub installation token was rejected while listing repositories.',
  'Branch metadata schema not yet initialized. Apply the approved migration first.',
]);

function safeSyncApiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : '';
  return SYNC_ERROR_ALLOWLIST.has(msg) ? msg : 'Branch synchronization failed.';
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
 * POST /api/github/installation/:installationId/branches/sync
 * PM-only. Synchronizes branch metadata for all repositories under the installation using a short-lived
 * GitHub installation access token (never persisted or exposed). Uses installation
 * lock to prevent concurrent syncs. Returns a safe summary (no tokens/credentials).
 */
router.post(
  '/:installationId/branches/sync',
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

        // Ensure branch table exists before sync (additive check; no DDL execution).
        const branchTable = await client.query(
          `SELECT 1 FROM information_schema.tables
           WHERE table_schema = current_schema() AND table_name = 'github_branches' AND table_type = 'BASE TABLE'
           LIMIT 1`
        );
        if (branchTable.rows.length === 0) {
          return res.status(503).json({
            success: false,
            error: 'Branch metadata schema not yet initialized. Apply the approved migration first.',
          });
        }
        githubInstallationId = resolved.githubInstallationId;
      } finally {
        client.release();
      }
    }

    try {
      const summary = await syncInstallationBranches(pool, githubInstallationId);
      const incomplete = summary.truncated || summary.complete === false;
      return res.status(200).json({
        success: !incomplete,
        message: incomplete
          ? 'Branch synchronization completed with incomplete results.'
          : 'Branch metadata synchronized.',
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
      console.error('GitHub branch sync failed.');
      return res.status(500).json({ success: false, error: safe });
    }
  }
);

/**
 * GET /api/github/installation/:installationId/branches
 * PM-only. Returns stored branch metadata for all repositories under the installation (no GitHub API call).
 */
router.get(
  '/:installationId/branches',
  authenticateToken,
  requirePM,
  async (req: AuthenticatedRequest, res: Response) => {
    const client = await pool.connect();
    try {
      const resolved = await resolveActiveInstallation(client, String(req.params.installationId), req);
      if (!resolved.ok) {
        return res.status(resolved.status).json({ success: false, error: resolved.error });
      }

      const branchTable = await client.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = current_schema() AND table_name = 'github_branches' AND table_type = 'BASE TABLE'
         LIMIT 1`
      );
      if (branchTable.rows.length === 0) {
        return res.status(503).json({
          success: false,
          error: 'Branch metadata schema not yet initialized. Apply the approved migration first.',
        });
      }

      const branches = await listInstallationBranches(client, resolved.githubInstallationId);
      return res.status(200).json({
        success: true,
        installationId: resolved.githubInstallationId,
        count: branches.length,
        branches,
      });
    } catch {
      // M3: never log raw database/driver errors, tokens, or connection details.
      console.error('GitHub branch list failed.');
      return res.status(500).json({ success: false, error: 'Failed to list branches.' });
    } finally {
      client.release();
    }
  }
);

export default router;
