import crypto from 'crypto';

export interface PoolClientLike {
  query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number }>;
}

export type InstallationIdLike = string | number | bigint;
export type UserIdLike = string | number | bigint;

export function normalizeInstallationId(githubInstallationId: InstallationIdLike): string {
  let s: string;
  if (typeof githubInstallationId === 'bigint') {
    s = githubInstallationId.toString();
  } else if (typeof githubInstallationId === 'number') {
    if (!Number.isSafeInteger(githubInstallationId) || githubInstallationId <= 0) {
      throw new Error('Invalid GitHub installation ID for lock key.');
    }
    s = String(githubInstallationId);
  } else {
    s = String(githubInstallationId).trim();
  }
  if (!/^[1-9]\d*$/.test(s)) throw new Error('Invalid GitHub installation ID for lock key.');
  return s;
}

/**
 * Canonical exact-decimal representation for PM/user IDs that may originate from
 * PostgreSQL BIGINT (returned as string/number by pg) or JWT payloads.
 * Rejects unsafe/negative/non-integer values; never rounds via Number().
 */
export function normalizeUserId(userId: UserIdLike): string {
  let s: string;
  if (typeof userId === 'bigint') {
    s = userId.toString();
  } else if (typeof userId === 'number') {
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      throw new Error('Invalid user ID.');
    }
    s = String(userId);
  } else {
    s = String(userId).trim();
  }
  if (!/^[1-9]\d*$/.test(s)) throw new Error('Invalid user ID.');
  return s;
}

export interface InstallationLock {
  installationId: string; // canonical GitHub external installation ID (exact decimal string)
  lockToken: string;
  ownerId: string;
  expiresAt: Date;
}

export interface AcquireLockOptions {
  installationId: InstallationIdLike; // canonical GitHub external installation ID
  ownerId: string;
  ttlMs?: number;
}

const DEFAULT_TTL_MS = 30_000;

/**
 * Single-statement atomic acquire/recover using DB time (NOW()).
 * - If no row exists: inserts.
 * - If row exists but expired (expires_at <= NOW()): replaces owner/token/expiry.
 * - If row exists and active: no row returned.
 * This avoids a separate DELETE+INSERT race. Expiration checks use DB time.
 */
export async function acquireInstallationLock(
  client: PoolClientLike,
  opts: AcquireLockOptions
): Promise<InstallationLock | null> {
  const ttlMs = Math.max(1_000, opts.ttlMs ?? DEFAULT_TTL_MS);
  const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
  const lockToken = crypto.randomUUID();
  const installationId = normalizeInstallationId(opts.installationId);

  const res = await client.query(
    `INSERT INTO github_installation_locks (installation_id, lock_token, owner_id, acquired_at, expires_at, updated_at)
     VALUES ($1, $2, $3, NOW(), NOW() + ($4::text || ' seconds')::interval, NOW())
     ON CONFLICT (installation_id) DO UPDATE
       SET lock_token = EXCLUDED.lock_token,
           owner_id = EXCLUDED.owner_id,
           acquired_at = NOW(),
           expires_at = EXCLUDED.expires_at,
           updated_at = NOW()
       WHERE github_installation_locks.expires_at <= NOW()
     RETURNING installation_id, lock_token, owner_id, expires_at`,
    [installationId, lockToken, opts.ownerId, String(ttlSeconds)]
  );

  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return {
    installationId: normalizeInstallationId(row.installation_id),
    lockToken: String(row.lock_token),
    ownerId: String(row.owner_id),
    expiresAt: new Date(row.expires_at),
  };
}

/**
 * Releases only the exact current owner/token/installation. Safe if lock expired or was re-acquired.
 */
export async function releaseInstallationLock(
  client: PoolClientLike,
  lock: InstallationLock
): Promise<boolean> {
  const installationId = normalizeInstallationId(lock.installationId);
  const res = await client.query(
    `DELETE FROM github_installation_locks
     WHERE installation_id = $1 AND lock_token = $2 AND owner_id = $3`,
    [installationId, lock.lockToken, lock.ownerId]
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Renews an existing installation lock only when the exact installation ID,
 * lock token, and owner still own an unexpired lock row. Uses DB time for
 * expiration. Returns false on ownership loss, expiry, or missing row; callers
 * must stop safely and must not take over another worker's lock.
 */
export async function renewInstallationLock(
  client: PoolClientLike,
  lock: InstallationLock,
  ttlMs = DEFAULT_TTL_MS
): Promise<boolean> {
  const ttlSeconds = Math.max(1, Math.ceil(Math.max(1_000, ttlMs) / 1000));
  const installationId = normalizeInstallationId(lock.installationId);
  const res = await client.query(
    `UPDATE github_installation_locks
        SET expires_at = NOW() + ($4::text || ' seconds')::interval,
            updated_at = NOW()
      WHERE installation_id = $1
        AND lock_token = $2
        AND owner_id = $3
        AND expires_at > NOW()
      RETURNING installation_id, lock_token, owner_id, expires_at`,
    [installationId, lock.lockToken, lock.ownerId, String(ttlSeconds)]
  );
  if (res.rows.length === 0) return false;
  const row = res.rows[0];
  lock.expiresAt = new Date(row.expires_at);
  return true;
}

export async function withInstallationLock<T>(
  client: PoolClientLike,
  opts: AcquireLockOptions,
  fn: (lock: InstallationLock) => Promise<T>
): Promise<{ acquired: false } | { acquired: true; value: T }> {
  const lock = await acquireInstallationLock(client, opts);
  if (!lock) return { acquired: false };
  try {
    const value = await fn(lock);
    return { acquired: true, value };
  } finally {
    // Never throws to caller; stale owner cannot delete newer lock.
    await releaseInstallationLock(client, lock).catch(() => {});
  }
}

// Canonical helper: GitHub external installation ID is the lock/FIFO namespace.
// Always returns an exact decimal string (never a JS Number) to preserve BIGINT
// precision for GitHub external installation IDs. Input may be a number, bigint,
// or string; all are validated and normalized via normalizeInstallationId.
export function canonicalInstallationLockKey(githubInstallationId: InstallationIdLike): string {
  return normalizeInstallationId(githubInstallationId);
}
