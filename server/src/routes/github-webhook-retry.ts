import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { authenticateToken, requirePM, AuthenticatedRequest } from '../middleware/auth';
import { verifyDeliveryOwnership } from '../middleware/github-authorization';
import { createGitHubHeartbeatWorker } from '../workers/github-heartbeat';
import { withInstallationLock, canonicalInstallationLockKey, normalizeInstallationId, normalizeUserId } from '../services/installationLock.service';
import { recoverStaleProcessingDeliveries } from '../services/githubWebhookRecovery.service';

const router = Router();

router.post(
  '/',
  authenticateToken,
  requirePM,
  async (req: AuthenticatedRequest, res: Response) => {
    let userId: string;
    try {
      userId = normalizeUserId(req.user?.id as any);
    } catch {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }
    const userRole = String(req.user?.role || '').toUpperCase();

    const body = (req.body || {}) as { deliveryId: string; maxRetries?: unknown };
    const deliveryId = body.deliveryId;
    // Accepted range: non-negative integer. Default: 5 when omitted/null/empty.
    // Reject negative, non-integer, NaN, or otherwise invalid values safely.
    let maxRetries: number;
    if (body.maxRetries === undefined || body.maxRetries === null || body.maxRetries === '') {
      maxRetries = 5;
    } else {
      const parsed = Number(body.maxRetries);
      if (!Number.isInteger(parsed) || parsed < 0) {
        return res.status(400).json({ success: false, error: 'maxRetries must be a non-negative integer.' });
      }
      maxRetries = parsed;
    }
    if (!deliveryId || typeof deliveryId !== 'string') {
      return res.status(400).json({ success: false, error: 'deliveryId string is required.' });
    }

    const client = await pool.connect();
    try {
      const { valid, error } = await verifyDeliveryOwnership(client, [deliveryId], userId, userRole);
      // PM-as-administrator policy: PMs may retry deliveries for any installation.
      if (!valid) return res.status(403).json({ success: false, error });

      const meta = await client.query(
        `SELECT d.id, d.delivery_id, d.installation_id, d.status, d.arrival_order
         FROM github_webhook_deliveries d
         WHERE d.delivery_id = $1`,
        [deliveryId]
      );
      if (meta.rows.length === 0) return res.status(404).json({ success: false, error: 'Delivery not found.' });
      const rawInstallationId = meta.rows[0].installation_id;
      const githubInstallationId = canonicalInstallationLockKey(normalizeInstallationId(rawInstallationId));
      if (!githubInstallationId) {
        return res.status(409).json({ success: false, error: 'Delivery has no installation scope; cannot safely retry with FIFO.' });
      }

      const deliveryWorkerId = `delivery-worker-${deliveryId}-${Date.now()}`;
      const lockedUntil = new Date(Date.now() + 5 * 60 * 1000);

      const lockRun = await withInstallationLock(
        client,
        { installationId: githubInstallationId, ownerId: `retry:${userId}:${deliveryId}:${deliveryWorkerId}`, ttlMs: 15_000 },
        async () => {
          // Recover stale processing (expired lease) so failed/abandoned FIFO head can advance safely.
          await recoverStaleProcessingDeliveries(client, { installationId: githubInstallationId, maxRows: 10 });

          await client.query('BEGIN');
          try {
            const claimQuery = `
              SELECT d.id, d.delivery_id, d.installation_id, d.event_type, d.payload
              FROM github_webhook_deliveries d
              INNER JOIN github_installations i ON i.installation_id = d.installation_id
              WHERE d.delivery_id = $1
                AND d.status IN ('failed', 'abandoned')
                AND d.attempts <= $2
                AND i.pm_user_id = $3
                AND i.is_active = TRUE
                AND NOT EXISTS (
                  SELECT 1 FROM github_webhook_deliveries earlier
                  WHERE earlier.installation_id = d.installation_id
                    AND earlier.arrival_order < d.arrival_order
                    AND earlier.status IN ('pending','processing')
                )
              FOR UPDATE SKIP LOCKED
            `;
            const claimRes = await client.query(claimQuery, [deliveryId, maxRetries, userId]);
            if (claimRes.rows.length === 0) {
              await client.query('ROLLBACK');
              const stateRes = await client.query(
                `SELECT d.status, d.attempts,
                        EXISTS (
                          SELECT 1 FROM github_webhook_deliveries earlier
                          WHERE earlier.installation_id = d.installation_id
                            AND earlier.arrival_order < d.arrival_order
                            AND earlier.status IN ('pending','processing')
                        ) AS blocked_by_fifo
                 FROM github_webhook_deliveries d WHERE d.delivery_id = $1`,
                [deliveryId]
              );
              const st = stateRes.rows[0];
              if (st?.blocked_by_fifo) {
                return { status: 409 as const, body: { success: false, error: 'Delivery is not head-of-line for this installation (FIFO).', claimed: [], skipped: [deliveryId], results: [] } };
              }
              return { status: 409 as const, body: { success: false, error: 'Delivery not eligible for retry or already being processed.', claimed: [], skipped: [deliveryId], results: [] } };
            }

            const row = claimRes.rows[0];
            await client.query(
              `UPDATE github_webhook_deliveries
               SET status = 'processing', attempts = attempts + 1, updated_at = NOW(), last_error = NULL
               WHERE id = $1 AND status IN ('failed', 'abandoned')`,
              [row.id]
            );
            await client.query(
              `INSERT INTO github_worker_leases (worker_id, lease_owner_id, installation_id, delivery_id, locked_until)
               VALUES ($1, $2, $3, $4, $5)`,
              [deliveryWorkerId, userId, githubInstallationId, deliveryId, lockedUntil]
            );
            await client.query('COMMIT');
          } catch (e) {
            await client.query('ROLLBACK').catch(() => {});
            throw e;
          }

          const deliveryWorker = createGitHubHeartbeatWorker(deliveryWorkerId);
          await deliveryWorker.addDelivery(deliveryId, userId, githubInstallationId);

          return {
            status: 200 as const,
            body: {
              success: true,
              message: 'Delivery claimed for retry with dedicated worker (FIFO-safe).',
              claimed: [deliveryId],
              skipped: [],
              results: [{ deliveryId, status: 'processing', workerId: deliveryWorkerId }],
            },
          };
        }
      );

      if (!lockRun.acquired) {
        return res.status(423).json({ success: false, error: 'Installation is locked by another operation. Retry safely.', claimed: [], skipped: [deliveryId], results: [] });
      }
      return res.status(lockRun.value.status).json(lockRun.value.body);
    } catch (err: any) {
      console.error('GitHub webhook retry error:', err.message);
      return res.status(500).json({ success: false, error: 'Internal server error during retry.' });
    } finally {
      client.release();
    }
  }
);

export default router;
