import crypto from 'crypto';
import { InstallationIdLike, normalizeInstallationId, normalizeUserId } from './installationLock.service';

export interface PoolClientLike {
  query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number }>;
}

export interface SignedStatePayload {
  installationId: InstallationIdLike; // canonical GitHub external installation ID (exact decimal string)
  pmUserId: InstallationIdLike; // canonical exact-decimal PM user ID (JWT/DB BIGINT-safe boundary)
  jti: string;
  exp: number; // unix seconds
  purpose: 'github_installation_callback';
  setupAction?: string | null; // GitHub App setup action (install/update) when applicable
}

function base64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fromBase64url(input: string): Buffer {
  const pad = 4 - (input.length % 4 || 4);
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad === 4 ? 0 : pad);
  return Buffer.from(b64, 'base64');
}

export function getStateSecret(): string {
  const secret = process.env.GITHUB_INSTALLATION_STATE_SECRET || process.env.GITHUB_NONCE_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('Missing GITHUB_INSTALLATION_STATE_SECRET/GITHUB_NONCE_SECRET/JWT_SECRET for callback security.');
  return secret;
}

export function signInstallationState(payload: SignedStatePayload, secret = getStateSecret()): string {
  const body = base64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(body).digest();
  return `${body}.${base64url(sig)}`;
}

export function verifyInstallationState(
  state: string,
  expected: { installationId: InstallationIdLike; pmUserId: InstallationIdLike },
  secret = getStateSecret()
): SignedStatePayload {
  if (!state || typeof state !== 'string') throw new Error('Missing state.');
  const parts = state.split('.');
  if (parts.length !== 2) throw new Error('Malformed state.');
  const [body, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(body).digest();
  const actualSig = fromBase64url(sig);
  if (actualSig.length !== expectedSig.length || !crypto.timingSafeEqual(actualSig, expectedSig)) {
    throw new Error('Invalid state signature.');
  }
  const payload = JSON.parse(fromBase64url(body).toString('utf8')) as SignedStatePayload;
  if (payload.purpose !== 'github_installation_callback') throw new Error('Invalid state purpose.');
  if (normalizeInstallationId(payload.installationId) !== normalizeInstallationId(expected.installationId)) throw new Error('State installation mismatch.');
  // Exact decimal comparison; accepts legacy numeric JSON payloads and current string payloads.
  if (normalizeUserId(payload.pmUserId) !== normalizeUserId(expected.pmUserId)) throw new Error('State user mismatch.');
  if (!payload.jti || typeof payload.jti !== 'string') throw new Error('State missing nonce id.');
  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) throw new Error('State expired.');
  // Normalize to canonical exact string for downstream consumers/SQL params.
  return { ...payload, installationId: normalizeInstallationId(payload.installationId), pmUserId: normalizeUserId(payload.pmUserId) };
}

export async function consumeInstallationNonce(client: PoolClientLike, payload: SignedStatePayload): Promise<boolean> {
  const nonceHash = crypto.createHash('sha256').update(payload.jti).digest('hex');
  const expiresAt = new Date(payload.exp * 1000);
  // Scope cleanup to the current installation only (PM-as-administrator policy still applies;
  // other installations' expired nonces are preserved).
  const installationId = normalizeInstallationId(payload.installationId);
  await client.query(
    `DELETE FROM github_nonce_consumption WHERE installation_id = $1 AND expires_at IS NOT NULL AND expires_at <= NOW()`,
    [installationId]
  );
  const res = await client.query(
    `INSERT INTO github_nonce_consumption (nonce_hash, installation_id, pm_user_id, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (nonce_hash) DO NOTHING
     RETURNING nonce_hash`,
    [nonceHash, installationId, normalizeUserId(payload.pmUserId), expiresAt]
  );
  return res.rows.length === 1;
}

function normalizePrivateKey(raw: string): string {
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
}

/**
 * Generates a short-lived GitHub App JWT (RS256) from backend secrets.
 * Never expose private key or JWT to frontend.
 */
export function generateGitHubAppJwt(nowSeconds = Math.floor(Date.now() / 1000)): string {
  const appId = process.env.GITHUB_APP_ID;
  const privateKeyRaw = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKeyRaw) {
    throw new Error('Missing GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY for GitHub App authentication.');
  }
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iat: nowSeconds - 60, // clock skew allowance
    exp: nowSeconds + 9 * 60, // short-lived (<10 min)
    iss: appId,
  };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(normalizePrivateKey(privateKeyRaw));
  return `${signingInput}.${base64url(signature)}`;
}

export async function verifyGitHubInstallationAccess(installationId: InstallationIdLike): Promise<{ ok: boolean; reason?: string; data?: any }> {
  try {
    const appJwt = generateGitHubAppJwt();
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    const idStr = normalizeInstallationId(installationId);
    const resp = await fetch(`https://api.github.com/app/installations/${idStr}`, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${appJwt}`,
        'User-Agent': 'pms-github-integration',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!resp.ok) return { ok: false, reason: `GitHub installation verification failed (${resp.status}).` };
    const data: any = await resp.json().catch(() => ({}));
    const dataId = data?.id != null ? String(data.id) : null;
    if (dataId !== idStr) return { ok: false, reason: 'GitHub installation ID mismatch.' };
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, reason: `GitHub installation verification error: ${err?.message || 'unknown'}` };
  }
}

/**
 * GitHub App installation setup callback validation (actual configured flow in this codebase):
 * GitHub redirects after installation; we require an authenticated PM-bound signed state and
 * verify the installation via GitHub App API. OAuth authorization `code` exchange is NOT used
 * by this GitHub App installation callback flow and is not required/accepted as proof.
 */
export function validateInstallationCallbackParams(params: {
  state?: unknown;
  setup_action?: unknown;
  installation_id?: unknown;
}): { ok: true; state: string; setupAction: string | null } | { ok: false; error: string } {
  if (!params.state || typeof params.state !== 'string') return { ok: false, error: 'Secure callback state is required.' };
  // setup_action is informational from GitHub; accept known values or absence.
  const setup = params.setup_action == null ? null : String(params.setup_action);
  if (setup && !['install', 'update', 'request', 'suspend', 'unsuspend', 'deleted'].includes(setup)) {
    // do not hard-fail unknown future values; keep validation permissive but typed
  }
  return { ok: true, state: params.state, setupAction: setup };
}
