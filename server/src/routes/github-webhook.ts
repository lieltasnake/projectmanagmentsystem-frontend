import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { githubWebhookMiddleware, GitHubWebhookRequest } from '../middleware/github-webhook';
import { githubWebhookDeliveriesTableExists } from '../db/github-schema';
import { createGitHubHeartbeatWorker } from '../workers/github-heartbeat';
import { withInstallationLock, normalizeInstallationId, normalizeUserId } from '../services/installationLock.service';
import { recoverStaleProcessingDeliveries } from '../services/githubWebhookRecovery.service';
import { claimNextPendingHead, finalizeClaimedDelivery } from '../services/githubWebhookFifo.service';

const router = Router();

async function resolveCanonicalGitHubInstallationId(client: any, installationIdParam: string): Promise<string | null> {
  const res = await client.query(
    `SELECT installation_id FROM github_installations WHERE installation_id = $1 LIMIT 1`,
    [installationIdParam]
  );
  if (res.rows.length === 0) return null;
  try {
    return normalizeInstallationId(res.rows[0].installation_id);
  } catch {
    return null;
  }
}

router.get('/health', async (_req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const exists = await githubWebhookDeliveriesTableExists(client);
    const instExistsRes = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'github_installations' AND table_type = 'BASE TABLE' LIMIT 1`
    );
    return res.status(200).json({ success: true, webhookDeliveriesTable: exists, githubInstallationsTable: instExistsRes.rows.length > 0 });
  } catch (err: any) {
    console.error('GitHub webhook health check error:', err.message);
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  } finally {
    client.release();
  }
});

async function processClaimedDelivery(client: any, claimed: { row: any; deliveryWorkerId: string }, githubInstallationId: string) {
  const deliveryWorker = createGitHubHeartbeatWorker(claimed.deliveryWorkerId);
  await deliveryWorker.addDelivery(claimed.row.delivery_id, 'webhook', githubInstallationId);
  let finalStatus = 'processed';
  let lastError: string | null = null;
  try {
    // Stage 1: mark delivery as processed; full GitHub issue sync excluded.
    // GitHub repository synchronization (branches, commits, PRs, reviews, webhooks,
    // manual sync, task-key linking) is excluded from v1. Do not report 'success'
    // as that would falsely imply GitHub sync completed.
    finalStatus = 'processed';
  } catch (procErr: any) {
    finalStatus = 'failed';
    lastError = procErr?.message || 'Webhook processing failed.';
  }
  const finalized = await finalizeClaimedDelivery(client, {
    deliveryRowId: claimed.row.id,
    deliveryId: claimed.row.delivery_id,
    workerId: claimed.deliveryWorkerId,
    leaseOwnerId: 'webhook',
    finalStatus,
    lastError,
  });
  if (!finalized.finalized) {
    await deliveryWorker.stop().catch(() => {});
    await client
      .query(`DELETE FROM github_worker_leases WHERE worker_id = $1 AND lease_owner_id = $2 AND delivery_id = $3`, [
        claimed.deliveryWorkerId,
        'webhook',
        claimed.row.delivery_id,
      ])
      .catch(() => {});
    return { ok: false as const, deliveryId: claimed.row.delivery_id, status: 'ownership_lost' };
  }
  return { ok: true as const, deliveryId: claimed.row.delivery_id, status: finalStatus };
}

router.post(
  '/:installationId',
  githubWebhookMiddleware,
  async (req: GitHubWebhookRequest, res: Response) => {
    let installationIdParam: string;
    try {
      installationIdParam = normalizeInstallationId(String(req.params.installationId));
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid installation ID.' });
    }
    const client = await pool.connect();
    try {
      const instExists = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'github_installations' AND table_type = 'BASE TABLE' LIMIT 1`
      );
      if (instExists.rows.length === 0) {
        return res.status(503).json({ success: false, error: 'GitHub integration schema not yet initialized.' });
      }

      const instRes = await client.query(
        `SELECT id, installation_id, pm_user_id, is_active FROM github_installations WHERE installation_id = $1 LIMIT 1`,
        [installationIdParam]
      );
      if (instRes.rows.length === 0) return res.status(404).json({ success: false, error: 'GitHub installation not found.' });
      const installation = instRes.rows[0];
      if (!installation.is_active) return res.status(410).json({ success: false, error: 'GitHub installation is no longer active.' });

      const reqAny = req as any;
      if (reqAny.user?.id) {
        // PM-as-administrator policy: an authenticated PM may access any installation's webhook.
        const userRole = String(reqAny.user.role || '').toUpperCase();
        try {
          const pmUserId = normalizeUserId(installation.pm_user_id);
          const reqUserId = normalizeUserId(reqAny.user.id);
          if (userRole !== 'PM' && pmUserId !== reqUserId) {
            return res.status(403).json({ success: false, error: 'Forbidden: You do not own this GitHub installation.' });
          }
        } catch {
          return res.status(403).json({ success: false, error: 'Forbidden: You do not own this GitHub installation.' });
        }
      }

      const deliveryId = req.githubDeliveryId as string;
      const eventType = req.githubEventType as string;
      const payload = req.githubPayload;
      const payloadText = req.githubPayloadText;
      const githubInstallationId = await resolveCanonicalGitHubInstallationId(client, installationIdParam);
      if (githubInstallationId == null) return res.status(404).json({ success: false, error: 'GitHub installation not found.' });
      // If middleware extracted an installation ID, require it matches the canonical path installation.
      if (req.githubInstallationId && req.githubInstallationId !== githubInstallationId) {
        return res.status(400).json({ success: false, error: 'Webhook installation ID mismatch.' });
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return res.status(400).json({ success: false, error: 'Invalid webhook payload structure.' });
      }
      if (!payloadText || typeof payloadText !== 'string') {
        return res.status(400).json({ success: false, error: 'Invalid webhook payload text.' });
      }

      await client.query(
        `INSERT INTO github_webhook_deliveries (delivery_id, installation_id, event_type, payload, status, arrival_order)
         VALUES ($1, $2, $3, $4::jsonb, 'pending', nextval('github_webhook_delivery_arrival_seq'))
         ON CONFLICT (delivery_id) DO NOTHING`,
        [deliveryId, githubInstallationId, eventType, payloadText]
      );

      const lockRun = await withInstallationLock(
        client,
        { installationId: githubInstallationId, ownerId: `webhook:${deliveryId}`, ttlMs: 20_000 },
        async () => {
          // Recover only genuinely expired processing deliveries for this installation so FIFO can advance.
          // Uses DB NOW()/lease expiry; active renewed leases prevent recovery.
          await recoverStaleProcessingDeliveries(client, { installationId: githubInstallationId, maxRows: 10 });
          const processed: Array<{ deliveryId: string; status: string; ok: boolean }> = [];
          for (let i = 0; i < 10; i++) {
            // Stage 1 invariant reference: deliveryWorkerId = `delivery-worker-${deliveryId}-${Date.now()}`
            const claimed = await claimNextPendingHead(client, githubInstallationId, 'webhook', deliveryId);
            if (!claimed) break;
            const result = await processClaimedDelivery(client, claimed, githubInstallationId);
            processed.push({ deliveryId: result.deliveryId, status: result.status, ok: result.ok });
          }
          const current = await client.query(`SELECT status FROM github_webhook_deliveries WHERE delivery_id = $1`, [deliveryId]);
          return { processed, currentStatus: current.rows[0]?.status || 'unknown' };
        }
      );

      if (!lockRun.acquired) {
        return res.status(202).json({ success: true, message: 'Webhook accepted; installation busy, delivery queued.', deliveryId, status: 'queued' });
      }

      const mine = lockRun.value.processed.find((p) => p.deliveryId === deliveryId);
      if (mine) {
        if (!mine.ok) {
          return res.status(409).json({ success: false, message: 'Delivery ownership lost or already processed by another worker.', deliveryId, status: 'ownership_lost' });
        }
        return res.status(200).json({ success: true, message: 'Webhook received and processed.', deliveryId, status: mine.status });
      }
      if (lockRun.value.currentStatus === 'pending' || lockRun.value.currentStatus === 'failed') {
        return res.status(202).json({ success: true, message: 'Webhook accepted; delivery queued for FIFO processing.', deliveryId, status: 'queued' });
      }
      return res.status(200).json({ success: true, message: 'Delivery already processed.', deliveryId, status: 'already_processed' });
    } catch (err: any) {
      console.error('GitHub webhook processing error:', err.message);
      return res.status(500).json({ success: false, error: 'Internal server error.' });
    } finally {
      client.release();
    }
  }
);

export default router;
