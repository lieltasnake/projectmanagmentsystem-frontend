import { normalizeInstallationId, normalizeUserId } from '../services/installationLock.service';

/**
 * GitHub Authorization Middleware
 *
 * AUTHORIZATION POLICY (confirmed business decision):
 * All authenticated PMS Project Managers are GitHub installation administrators.
 * - Every authenticated PM can manage all GitHub installations.
 * - Any PM can generate installation callback state and nonce.
 * - Any PM can activate an installation.
 * - Any PM can retry GitHub webhook deliveries.
 * - Team Leaders and Team Members cannot access PM-only GitHub management endpoints.
 * - Existing authentication (authenticateToken) and PM-role (requirePM) restrictions remain enforced.
 *
 * `requireInstallationOwnership` was previously defined here but is intentionally NOT
 * used: under the PM-as-administrator policy, ownership is not restricted to the
 * installation's original PM. It was removed to avoid implying an ownership check
 * that the application does not perform. Do not re-add ownership-only restrictions
 * without an explicit policy change.
 *
 * Per Phase 1 Decisions 10-11:
 * - checkProjectAccess(): implemented in server/src/routes/projects.ts (used by task/routes)
 * - verifyDeliveryOwnership(): enforces PM-wide access (PMs may access all deliveries)
 */

/**
 * Verifies that a delivery belongs to an installation owned by the given user.
 * Used by the bulk retry endpoint per Phase 1 Decision 9.
 *
 * Under the PM-as-administrator policy, PMs may access all deliveries; ownership
 * is only enforced for non-PM users (who cannot reach this endpoint anyway due to
 * requirePM, but the check is retained for defense in depth).
 */
export async function verifyDeliveryOwnership(
  client: any,
  deliveryIds: string[],
  userId: number | string,
  userRole: string
): Promise<{ valid: boolean; installationIds?: string[]; error?: string }> {
  const role = userRole.toUpperCase();
  let userIdStr: string | null = null;
  if (role !== 'PM') {
    try {
      userIdStr = normalizeUserId(userId as any);
    } catch {
      return { valid: false, error: 'Invalid authenticated user.' };
    }
  }

  // Fetch delivery rows with their installation_ids (canonical GitHub external installation ID).
  const params: any[] = [];
  const placeholders = deliveryIds.map((_, i) => `$${i + 1}`).join(', ');
  params.push(...deliveryIds);

  // Join on github_installations.installation_id (GitHub external ID), not internal DB id.
  const query = `
    SELECT d.id, d.delivery_id, d.installation_id, i.pm_user_id, i.installation_id AS gh_installation_id
    FROM github_webhook_deliveries d
    LEFT JOIN github_installations i ON i.installation_id = d.installation_id
    WHERE d.delivery_id = ANY($1::TEXT[])
  `;

  const result = await client.query(query, [deliveryIds]);
  const rows = result.rows;

  if (rows.length === 0) {
    return { valid: false, error: 'No matching deliveries found.' };
  }

  if (rows.length !== deliveryIds.length) {
    const foundIds = rows.map((r: any) => r.delivery_id);
    const missingIds = deliveryIds.filter((id) => !foundIds.includes(id));
    return {
      valid: false,
      error: `Deliveries not found: ${missingIds.join(', ')}`,
    };
  }

  const installationIds: string[] = [];
  for (const row of rows) {
    let installationId: string | null = null;
    try {
      installationId = normalizeInstallationId(row.gh_installation_id ?? row.installation_id);
    } catch {
      installationId = null;
    }
    let pmUserId: string | null = null;
    try {
      pmUserId = row.pm_user_id != null ? normalizeUserId(row.pm_user_id) : null;
    } catch {
      pmUserId = null;
    }

    // Non-PM users must own the installation (exact decimal comparison; no Number() on BIGINT).
    // Under the PM-as-administrator policy, PMs bypass this check intentionally.
    if (role !== 'PM' && (pmUserId == null || userIdStr == null || pmUserId !== userIdStr)) {
      return {
        valid: false,
        error: `Delivery ${row.delivery_id} belongs to an installation you do not own.`,
      };
    }

    if (installationId !== null && !installationIds.includes(installationId)) {
      installationIds.push(installationId);
    }
  }

  return { valid: true, installationIds };
}
