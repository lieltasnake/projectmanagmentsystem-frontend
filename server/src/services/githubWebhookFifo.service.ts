/**
 * Minimal FIFO claim + conditional finalization helpers extracted from the webhook route
 * so production logic can be exercised by integration tests without duplicating SQL.
 * Route behavior is unchanged: routes call these helpers with the same parameters.
 */
import { InstallationIdLike, normalizeInstallationId } from './installationLock.service';

export interface PoolClientLike {
  query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number }>;
}

export interface ClaimedDeliveryRow {
  id: number;
  delivery_id: string;
  arrival_order: number;
  installation_id: string | number; // DB BIGINT may be returned as string or number by pg
  attempts: number;
}

export interface ClaimedDelivery {
  row: ClaimedDeliveryRow;
  deliveryWorkerId: string;
}

/**
 * Claims the next FIFO head delivery for an installation (exact production SQL).
 * Returns null when no eligible pending head exists.
 */
export async function claimNextPendingHead(
  client: PoolClientLike,
  githubInstallationId: InstallationIdLike,
  leaseOwnerId: string,
  requestedDeliveryId?: string
): Promise<ClaimedDelivery | null> {
  void requestedDeliveryId; // preserves Stage 1 pattern visibility
  const installationId = normalizeInstallationId(githubInstallationId);
  const res = await client.query(
    `UPDATE github_webhook_deliveries d
     SET status = 'processing', attempts = attempts + 1, updated_at = NOW(), last_error = NULL
     WHERE d.id = (
       SELECT cand.id
       FROM github_webhook_deliveries cand
       WHERE cand.installation_id = $1
         AND cand.status = 'pending'
         AND NOT EXISTS (
           SELECT 1 FROM github_webhook_deliveries earlier
           WHERE earlier.installation_id = cand.installation_id
             AND earlier.arrival_order < cand.arrival_order
             AND earlier.status IN ('pending', 'processing')
         )
       ORDER BY cand.arrival_order ASC, cand.id ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING d.id, d.delivery_id, d.arrival_order, d.installation_id, d.attempts`,
    [installationId]
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0] as ClaimedDeliveryRow;
  const deliveryWorkerId = `delivery-worker-${row.delivery_id}-${Date.now()}`;
  const lockedUntil = new Date(Date.now() + 5 * 60 * 1000);
  await client.query(
    `INSERT INTO github_worker_leases (worker_id, lease_owner_id, installation_id, delivery_id, locked_until)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (worker_id, delivery_id) DO UPDATE SET
       locked_until = EXCLUDED.locked_until, lease_owner_id = EXCLUDED.lease_owner_id,
       installation_id = EXCLUDED.installation_id, updated_at = NOW()`,
    [deliveryWorkerId, leaseOwnerId, installationId, row.delivery_id, lockedUntil]
  );
  return { row, deliveryWorkerId };
}

/**
 * Conditionally finalizes a claimed delivery only if the exact worker/lease owner/delivery
 * lease is still unexpired (production finalization invariant). Cleans up lease on ownership loss.
 */
export async function finalizeClaimedDelivery(
  client: PoolClientLike,
  params: {
    deliveryRowId: number;
    deliveryId: string;
    workerId: string;
    leaseOwnerId: string;
    finalStatus?: string;
    lastError?: string | null;
  }
): Promise<{ finalized: boolean }> {
  const finalStatus = params.finalStatus ?? 'success';
  const lastError = params.lastError ?? null;
  const updateResult = await client.query(
    `UPDATE github_webhook_deliveries d
     SET status = $2, last_error = $3, updated_at = NOW()
     WHERE d.id = $1
       AND d.status = 'processing'
       AND EXISTS (
         SELECT 1 FROM github_worker_leases w
         WHERE w.worker_id = $4
           AND w.lease_owner_id = $5
           AND w.delivery_id = $6
           AND w.locked_until > NOW()
       )`,
    [params.deliveryRowId, finalStatus, lastError, params.workerId, params.leaseOwnerId, params.deliveryId]
  );
  if ((updateResult.rowCount ?? 0) === 0) {
    await client
      .query(`DELETE FROM github_worker_leases WHERE worker_id = $1 AND lease_owner_id = $2 AND delivery_id = $3`, [
        params.workerId,
        params.leaseOwnerId,
        params.deliveryId,
      ])
      .catch(() => {});
    return { finalized: false };
  }
  return { finalized: true };
}
