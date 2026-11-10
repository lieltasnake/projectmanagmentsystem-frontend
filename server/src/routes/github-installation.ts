import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { pool } from '../db';
import { authenticateToken, requirePM, AuthenticatedRequest } from '../middleware/auth';
import { withInstallationLock, canonicalInstallationLockKey, normalizeInstallationId, normalizeUserId } from '../services/installationLock.service';
import {
  signInstallationState,
  verifyInstallationState,
  consumeInstallationNonce,
  verifyGitHubInstallationAccess,
  getStateSecret,
  validateInstallationCallbackParams,
  SignedStatePayload,
} from '../services/githubInstallationSecurity.service';

const router = Router();

/**
 * Canonical ID: GitHub external installation ID (github_installations.installation_id).
 * Internal DB row id (github_installations.id) is used only for record lookup; locks/FIFO/processing
 * always use the external GitHub installation ID.
 *
 * PM/user IDs are handled as exact decimal strings at boundaries (PG BIGINT-safe).
 * `req.user.id` remains the existing JWT contract (number in auth middleware); comparisons
 * use canonical decimal normalization and never unsafe Number() on DB BIGINT strings.
 */

async function resolveCanonicalInstallation(
  client: any,
  installationIdParam: string
): Promise<{ dbId: string; githubInstallationId: string; pmUserId: string; isActive: boolean } | null> {
  // Callers always supply the external GitHub installation ID (exact decimal string,
  // validated by normalizeInstallationId). Look up by installation_id only to avoid
  // ambiguity between internal DB id and external GitHub installation ID.
  const res = await client.query(
    `SELECT id, installation_id, pm_user_id, is_active FROM github_installations
     WHERE installation_id = $1
     LIMIT 1`,
    [installationIdParam]
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  let githubInstallationId: string;
  let pmUserId: string;
  try {
    githubInstallationId = normalizeInstallationId(row.installation_id);
    pmUserId = normalizeUserId(row.pm_user_id);
  } catch {
    return null;
  }
  return {
    dbId: String(row.id),
    githubInstallationId,
    pmUserId,
    isActive: !!row.is_active,
  };
}

router.get(
  '/state',
  authenticateToken,
  requirePM,
  async (req: AuthenticatedRequest, res: Response) => {
    let userId: string;
    try {
      userId = normalizeUserId(req.user?.id as any);
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid request.' });
    }

    // Bind state to the PM who initiated the installation.
    // installation_id is unknown at this point (GitHub assigns it during install),
    // so installationId is set to pmUserId for payload structure only. The actual
    // GitHub installation_id is verified at callback time via verifyGitHubInstallationAccess.
    const payload: SignedStatePayload = {
      installationId: userId,
      pmUserId: userId,
      jti: crypto.randomUUID(),
      exp: Math.floor(Date.now() / 1000) + 300,
      purpose: 'github_installation_callback',
      setupAction: null,
    };
    const state = signInstallationState(payload);
    return res.status(200).json({
      success: true,
      state,
      installationId: null,
      expiresInSeconds: 300,
    });
  }
);

/**
 * GET callback for GitHub App installation setup.
 * GitHub redirects here after installation with ?installation_id, ?setup_action, ?state.
 * Validates signed state, verifies installation via GitHub App API, consumes nonce,
 * creates or activates the installation record, then redirects to the PMS frontend.
 * No OAuth code exchange is used.
 */
router.get(
  '/callback',
  async (req: Request, res: Response) => {
    const { state, installation_id, setup_action } = req.query as Record<string, string | string[] | undefined>;

    const stateStr = Array.isArray(state) ? state[0] : state;
    const installationIdStr = Array.isArray(installation_id) ? installation_id[0] : installation_id;

    if (!stateStr || typeof stateStr !== 'string') {
      return redirectToFrontend(res, false, 'Missing state parameter.');
    }
    if (!installationIdStr || typeof installationIdStr !== 'string') {
      return redirectToFrontend(res, false, 'Missing installation_id parameter.');
    }

    // Decode state payload (without verification) to extract pmUserId for expected binding.
    // The state was signed by the backend; pmUserId inside it is the PM who initiated install.
    let decodedPmUserId: string;
    try {
      const parts = stateStr.split('.');
      if (parts.length !== 2) throw new Error('Malformed state.');
      const bodyBuf = fromBase64urlInline(parts[0]);
      const payload = JSON.parse(bodyBuf.toString('utf8')) as { pmUserId: string | number | bigint | unknown };
      decodedPmUserId = normalizeUserId(payload.pmUserId as string | number | bigint);
    } catch {
      return redirectToFrontend(res, false, 'Invalid state format.');
    }

    // Verify state signature, expiry, purpose, and PM binding.
    // installationId in state was set to pmUserId at generation time (installation_id unknown then),
    // so the installationId check passes trivially; the real GitHub installation_id is verified
    // separately via verifyGitHubInstallationAccess below.
    let verifiedPayload: SignedStatePayload;
    try {
      verifiedPayload = verifyInstallationState(stateStr, { installationId: decodedPmUserId, pmUserId: decodedPmUserId });
    } catch (e: any) {
      return redirectToFrontend(res, false, `Invalid state: ${e.message}`);
    }

    // Validate and normalize installation ID from GitHub (never trust browser-supplied ID).
    let githubInstallationId: string;
    try {
      githubInstallationId = normalizeInstallationId(installationIdStr);
    } catch {
      return redirectToFrontend(res, false, 'Invalid installation ID.');
    }

    // Verify the installation exists on GitHub via the App JWT (server-side only).
    const gh = await verifyGitHubInstallationAccess(githubInstallationId);
    if (!gh.ok) {
      return redirectToFrontend(res, false, `GitHub installation verification failed: ${gh.reason || 'unknown'}`);
    }

    // Database transaction: check ownership, consume nonce, upsert installation.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check existing installation ownership.
      const existing = await client.query(
        'SELECT pm_user_id FROM github_installations WHERE installation_id = $1',
        [githubInstallationId]
      );

      if (existing.rows.length > 0) {
        const existingPmUserId = normalizeUserId(existing.rows[0].pm_user_id);
        if (existingPmUserId !== decodedPmUserId) {
          await client.query('ROLLBACK');
          return redirectToFrontend(res, false, 'This GitHub installation is already owned by another PMS user.');
        }
      }

      // Consume nonce exactly once (replay protection).
      const consumed = await consumeInstallationNonce(client, verifiedPayload);
      if (!consumed) {
        await client.query('ROLLBACK');
        return redirectToFrontend(res, false, 'State already used or expired.');
      }

       // Create or activate installation (idempotent upsert).
       const githubOrgName = gh.data?.account?.login ?? 'unknown';
       await client.query(
         `INSERT INTO github_installations (installation_id, pm_user_id, github_org_name, github_repo_full_name, is_active, created_at, updated_at)
          VALUES ($1, $2, $3, 'unknown', TRUE, NOW(), NOW())
          ON CONFLICT (installation_id) DO UPDATE SET
            pm_user_id = EXCLUDED.pm_user_id,
            github_org_name = EXCLUDED.github_org_name,
            github_repo_full_name = COALESCE(github_installations.github_repo_full_name, EXCLUDED.github_repo_full_name),
            is_active = TRUE,
            updated_at = NOW()`,
         [githubInstallationId, decodedPmUserId, githubOrgName]
       );

      await client.query('COMMIT');
      return redirectToFrontend(res, true, undefined, githubInstallationId);
    } catch (err: any) {
      const pgCode = err?.code ?? 'N/A';
      const pgMessage = err?.message ?? 'No message provided';
      console.error(`Database error during activation. PG code=${pgCode}: ${pgMessage}`);
      await client.query('ROLLBACK').catch(() => {});
      return redirectToFrontend(res, false, `Database error during activation. (${pgMessage}, code=${pgCode}).`);
    } finally {
      client.release();
    }
  }
);

/**
 * POST callback for GitHub App installation setup.
 * Actual flow: authenticated PM + signed state + server-side GitHub App API verification.
 * `code` is not required for this GitHub App installation setup callback in this codebase.
 * If OAuth authorization-code exchange is introduced later, it must be implemented explicitly
 * with GitHub's token endpoint and bound to the same verified installation/state.
 */
router.post(
  '/:installationId',
  authenticateToken,
  requirePM,
  async (req: AuthenticatedRequest, res: Response, _next: NextFunction) => {
    let userId: string;
    let installationIdParam: string;
    try {
      userId = normalizeUserId(req.user?.id as any);
      installationIdParam = normalizeInstallationId(String(req.params.installationId));
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid request.' });
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const validatedParams = validateInstallationCallbackParams({
      state: body.state,
      setup_action: body.setup_action,
      installation_id: body.installation_id,
    });
    if (!validatedParams.ok) return res.status(400).json({ success: false, error: validatedParams.error });
    // Explicitly ignore `code` if present (misleading for GitHub App setup callback).
    if (body.code != null) {
      // Non-fatal: accepted but not used. Do not perform OAuth exchange.
    }

    const client = await pool.connect();
    try {
      const schemaRes = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'github_installations' AND table_type = 'BASE TABLE' LIMIT 1`
      );
      if (schemaRes.rows.length === 0) {
        return res.status(503).json({ success: false, error: 'GitHub integration schema not yet initialized.' });
      }

      const inst = await resolveCanonicalInstallation(client, installationIdParam);
      if (!inst) return res.status(404).json({ success: false, error: 'GitHub installation record not found.' });
      const role = String(req.user?.role || '').toUpperCase();
      // PM-as-administrator policy: PMs may manage all installations.
      if (role !== 'PM' && inst.pmUserId !== userId) {
        return res.status(403).json({ success: false, error: 'Forbidden: You do not own this GitHub installation.' });
      }
      if (!inst.isActive) return res.status(410).json({ success: false, error: 'GitHub installation is no longer active.' });
      const githubInstallationId = canonicalInstallationLockKey(inst.githubInstallationId);

      let payload;
      try {
        getStateSecret();
        // verifyInstallationState accepts legacy numeric/string pmUserId in state and compares exactly.
        payload = verifyInstallationState(validatedParams.state, { installationId: githubInstallationId, pmUserId: userId });
      } catch (e: any) {
        return res.status(400).json({ success: false, error: `Invalid callback state: ${e.message}` });
      }

      // External GitHub App installation verification is performed BEFORE acquiring the
      // installation lock so the lock is held only for the serialized DB operations
      // (nonce consumption + activation). Verification is idempotent, does not depend on
      // lock state, and does not consume the nonce or touch the DB on failure.
      const gh = await verifyGitHubInstallationAccess(githubInstallationId);
      if (!gh.ok) {
        return res.status(502).json({ success: false, error: gh.reason || 'GitHub installation verification failed.' });
      }

      const lockResult = await withInstallationLock(
        client,
        { installationId: githubInstallationId, ownerId: `callback:${userId}:${crypto.randomUUID()}`, ttlMs: 15_000 },
        async () => {
          const consumed = await consumeInstallationNonce(client, payload);
          if (!consumed) return { status: 409 as const, body: { success: false, error: 'Callback state/nonce already used or expired.' } };
          await client.query(
            `UPDATE github_installations SET updated_at = NOW(), is_active = TRUE
             WHERE installation_id = $1 AND (pm_user_id = $2 OR $3 = 'PM')`,
            [githubInstallationId, userId, role]
          );
          return { status: 200 as const, body: { success: true, message: 'GitHub installation callback validated.', installationId: githubInstallationId } };
        }
      );
      if (!lockResult.acquired) return res.status(423).json({ success: false, error: 'Installation is locked by another operation. Retry safely.' });
      return res.status(lockResult.value.status).json(lockResult.value.body);
    } catch (err: any) {
      console.error('GitHub installation callback error:', err.message);
      return res.status(500).json({ success: false, error: 'Internal server error.' });
    } finally {
      client.release();
    }
  }
);

// Compatibility nonce endpoint (delegates to state issuance)
router.get('/:installationId/nonce', authenticateToken, requirePM, async (req: AuthenticatedRequest, res: Response) => {
    let userId: string;
    let installationIdParam: string;
    try {
      userId = normalizeUserId(req.user?.id as any);
      installationIdParam = normalizeInstallationId(String(req.params.installationId));
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid request.' });
    }
  const client = await pool.connect();
  try {
    const inst = await resolveCanonicalInstallation(client, installationIdParam);
    if (!inst) return res.status(404).json({ success: false, error: 'GitHub installation not found.' });
    const role = String(req.user?.role || '').toUpperCase();
    // PM-as-administrator policy: PMs may manage all installations.
    if (role !== 'PM' && inst.pmUserId !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden: You do not own this installation.' });
    }
    if (!inst.isActive) return res.status(410).json({ success: false, error: 'GitHub installation is no longer active.' });
    const githubInstallationId = canonicalInstallationLockKey(inst.githubInstallationId);
    const payload = {
      installationId: githubInstallationId,
      pmUserId: userId,
      jti: crypto.randomUUID(),
      exp: Math.floor(Date.now() / 1000) + 300,
      purpose: 'github_installation_callback' as const,
      setupAction: null,
    };
    const state = signInstallationState(payload);
    return res.status(200).json({ success: true, state, nonce: state, installationId: githubInstallationId, expiresInSeconds: 300 });
  } catch (err: any) {
    console.error('GitHub installation nonce error:', err.message);
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/github/installation
 * PM-only. Lists GitHub installation records for the authenticated PM.
 * Returns only non-secret fields: installation ID and active status.
 * Preserves external GitHub installation IDs as exact decimal strings.
 */
router.get(
  '/',
  authenticateToken,
  requirePM,
  async (req: AuthenticatedRequest, res: Response) => {
    let userId: string;
    try {
      userId = normalizeUserId(req.user?.id as any);
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid request.' });
    }

    const client = await pool.connect();
    try {
      const schemaRes = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'github_installations' AND table_type = 'BASE TABLE' LIMIT 1`
      );
      if (schemaRes.rows.length === 0) {
        return res.status(503).json({ success: false, error: 'GitHub integration schema not yet initialized.' });
      }

      const role = String(req.user?.role || '').toUpperCase();
      const instRes = await client.query(
        `SELECT id, installation_id, pm_user_id, is_active, updated_at FROM github_installations ORDER BY updated_at DESC`
      );

      const installations = instRes.rows.map((row: any) => ({
        installationId: normalizeInstallationId(row.installation_id),
        isActive: !!row.is_active,
      }));

      return res.status(200).json({
        success: true,
        count: installations.length,
        installations,
      });
    } catch (err: any) {
      console.error('GitHub installation list error:', err.message);
      return res.status(500).json({ success: false, error: 'Internal server error.' });
    } finally {
      client.release();
    }
  }
);

/**
 * Decodes a base64url-encoded string (no verification). Used to extract pmUserId
 * from a signed state before calling verifyInstallationState.
 */
function fromBase64urlInline(input: string): Buffer {
  const pad = 4 - (input.length % 4 || 4);
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad === 4 ? 0 : pad);
  return Buffer.from(b64, 'base64');
}

/**
 * Redirects to the PMS frontend GitHub Integration page with result parameters.
 * Error messages are generic and never expose secrets or tokens.
 */
function redirectToFrontend(res: Response, success: boolean, error?: string, installationId?: string): void {
  const base = process.env.PMS_FRONTEND_URL || 'http://localhost:5173';
  const url = new URL(`${base}/github-integration`);
  url.searchParams.set('installed', success ? 'true' : 'false');
  if (installationId) url.searchParams.set('installationId', installationId);
  if (error) url.searchParams.set('error', error);
  res.redirect(url.toString());
}

export default router;
