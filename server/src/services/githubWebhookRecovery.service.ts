import { InstallationIdLike, normalizeInstallationId } from './installationLock.service';

export interface PoolClientLike {
  query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number }>;
}

/**
 * Recovers only deliveries that are genuinely stale:
 * - delivery.status = 'processing'
 * - and NO active unexpired lease exists for that delivery (locked_until > NOW())
 *
 * Uses atomic single-statement update with NOT EXISTS guard and DB NOW() so two
 * recoverers cannot "recover" the same row into conflicting states; only rows still
 * matching the stale condition at UPDATE time are affected.
 *
 * Recovered deliveries become 'failed' (retryable via existing retry endpoint) and get
 * a diagnostic last_error appended/preserved contextually. attempts is NOT incremented
 * here because the original claim already incremented attempts; retry policy remains
 * visible to PM retry endpoint.
 *
 * Actively renewed deliveries are protected because an unexpired lease makes NOT EXISTS false.
 * Old workers cannot finalize after recovery because finalization requires status='processing'
 * AND an unexpired matching lease row; recovery removes stale lease rows and changes status.
 */
export async function recoverStaleProcessingDeliveries(
  client: PoolClientLike,
  opts?: { installationId?: InstallationIdLike; maxRows?: number }
): Promise<{ recovered: string[] }> {
  const maxRows = Math.max(1, Math.min(100, opts?.maxRows ?? 25));
  const params: any[] = [maxRows];
  let installFilter = '';
  if (opts?.installationId != null) {
    const installationId = normalizeInstallationId(opts.installationId);
    params.push(installationId);
    installFilter = `AND d.installation_id = $${params.length}`;
  }

  // Lock candidate rows to avoid races, but rely on stale lease NOT EXISTS at update time.
  const sql = `
    WITH stale AS (
      SELECT d.id, d.delivery_id
      FROM github_webhook_deliveries d
      WHERE d.status = 'processing'
        ${installFilter}
        AND NOT EXISTS (
          SELECT 1 FROM github_worker_leases w
          WHERE w.delivery_id = d.delivery_id
            AND w.locked_until > NOW()
        )
      ORDER BY d.arrival_order ASC NULLS LAST, d.id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT $1
    ), recovered AS (
      UPDATE github_webhook_deliveries d
      SET status = 'failed',
          last_error = CASE
            WHEN d.last_error IS NULL OR d.last_error = '' THEN 'Recovered: processing lease expired'
            ELSE d.last_error || E'\nRecovered: processing lease expired'
          END,
          updated_at = NOW()
      FROM stale s
      WHERE d.id = s.id
        AND d.status = 'processing'
        AND NOT EXISTS (
          SELECT 1 FROM github_worker_leases w
          WHERE w.delivery_id = d.delivery_id
            AND w.locked_until > NOW()
        )
      RETURNING d.delivery_id
    ), removed_leases AS (
      DELETE FROM github_worker_leases w
      USING recovered r
      WHERE w.delivery_id = r.delivery_id
        AND w.locked_until <= NOW()
      RETURNING w.delivery_id
    )
    SELECT delivery_id FROM recovered
  `;

  const res = await client.query(sql, params);
  return { recovered: res.rows.map((r: any) => String(r.delivery_id)) };
}
