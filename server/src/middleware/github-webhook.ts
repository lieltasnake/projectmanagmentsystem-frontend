import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * GitHub Webhook Middleware
 *
 * Captures the raw request body before express.json() parses it (see server/src/index.ts),
 * verifies the HMAC-SHA256 signature against the exact original bytes, and extracts
 * webhook metadata.
 *
 * JSON parsing is lossless for large integers: unsafe integers (> Number.MAX_SAFE_INTEGER)
 * are preserved as strings (not JS Numbers) and the original validated JSON text is
 * retained for PostgreSQL JSONB storage to preserve numeric precision.
 *
 * Delivery deduplication is handled in the route handler via INSERT ... ON CONFLICT DO NOTHING.
 */

export interface GitHubWebhookRequest extends Request {
  githubDeliveryId?: string;
  githubEventType?: string;
  /** Lossless-parsed payload (unsafe integers preserved as strings). */
  githubPayload?: any;
  /** Original validated JSON text (byte-faithful UTF-8) for PostgreSQL JSONB storage. */
  githubPayloadText?: string;
  githubSignature?: string;
  /** GitHub installation ID extracted losslessly (no unsafe Number conversion). */
  githubInstallationId?: string | null;
}

/**
 * Reads the GitHub webhook secret at verification time (not module load).
 * This ensures runtime env changes and test-driven secret rotation take effect
 * without re-importing the module. Fail-closed: empty/missing secret is treated
 * as not configured.
 */
function getWebhookSecret(): string {
  return process.env.GITHUB_WEBHOOK_SECRET || '';
}

/**
 * Verifies the GitHub webhook signature (HMAC-SHA256).
 * Expected header format: "sha256=<hex signature>".
 * Uses crypto.timingSafeEqual to prevent timing attacks.
 */
export function verifyGitHubSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const parts = signatureHeader.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256') {
    return false;
  }

  const providedSignature = parts[1];
  const computedSignature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(providedSignature, 'utf-8'),
      Buffer.from(computedSignature, 'utf-8')
    );
  } catch {
    return false;
  }
}

/**
 * Lossless JSON parse: preserves unsafe integer tokens outside JSON strings as exact
 * decimal strings (never silently rounded to JS Numbers). Uses a string-boundary-aware
 * tokenizer as the reliable path (no runtime-dependent reviver context).
 */
export function parseJsonLossless(text: string): any {
  return JSON.parse(quoteUnsafeIntegers(text));
}

export function quoteUnsafeIntegers(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      let j = i;
      if (text[j] === '-') j++;
      if (j >= text.length || text[j] < '0' || text[j] > '9') {
        out += ch;
        continue;
      }
      while (j < text.length && text[j] >= '0' && text[j] <= '9') j++;
      // Skip floats/exponents (leave as-is; GitHub IDs are integers).
      if (j < text.length && (text[j] === '.' || text[j] === 'e' || text[j] === 'E')) {
        let k = j;
        if (text[k] === '.') {
          k++;
          while (k < text.length && text[k] >= '0' && text[k] <= '9') k++;
        }
        if (k < text.length && (text[k] === 'e' || text[k] === 'E')) {
          k++;
          if (k < text.length && (text[k] === '+' || text[k] === '-')) k++;
          while (k < text.length && text[k] >= '0' && text[k] <= '9') k++;
        }
        out += text.slice(i, k);
        i = k - 1;
        continue;
      }
      const token = text.slice(i, j);
      const n = Number(token);
      if (!Number.isSafeInteger(n) || String(n) !== token) {
        out += `"${token}"`;
      } else {
        out += token;
      }
      i = j - 1;
      continue;
    }
    out += ch;
  }
  return out;
}

export function extractInstallationIdLossless(payload: any): string | null {
  if (!payload || typeof payload !== 'object' || !payload.installation) return null;
  const id = (payload.installation as any).id;
  if (id === null || id === undefined) return null;
  if (typeof id === 'string' && /^\d+$/.test(id)) return id;
  if (typeof id === 'number' && Number.isSafeInteger(id) && id > 0) return String(id);
  if (typeof id === 'bigint' && id > 0n) return id.toString();
  return null;
}

/**
 * GitHub webhook middleware.
 * Verifies headers and signature (fail-closed), then parses payload losslessly.
 * Attaches parsed payload and original validated text to the request.
 */
export function githubWebhookMiddleware(
  req: GitHubWebhookRequest,
  res: Response,
  next: NextFunction
): void {
  const signatureHeader = req.headers['x-hub-signature-256'] as string | undefined;
  const deliveryId = req.headers['x-github-delivery'] as string | undefined;
  const eventType = req.headers['x-github-event'] as string | undefined;

  if (!deliveryId || !eventType) {
    res.status(400).json({
      success: false,
      error: 'Missing required GitHub webhook headers (x-github-delivery, x-github-event).',
    });
    return;
  }

  // Raw body is captured by express.raw() before this middleware runs.
  const rawBody = (req as any).rawBody as Buffer | undefined;
  if (!rawBody) {
    res.status(400).json({
      success: false,
      error: 'Raw body not available. Ensure express.raw() runs before this middleware.',
    });
    return;
  }

  // Fail closed: never bypass signature verification when secret is missing.
  const secret = getWebhookSecret();
  if (!secret) {
    res.status(500).json({
      success: false,
      error: 'Webhook secret not configured; refusing unsigned webhook.',
    });
    return;
  }
  if (!verifyGitHubSignature(rawBody, signatureHeader, secret)) {
    res.status(401).json({
      success: false,
      error: 'Invalid GitHub webhook signature.',
    });
    return;
  }

  // Parse JSON only after successful signature verification.
  const rawText = rawBody.toString('utf-8');
  let payload: any;
  try {
    payload = parseJsonLossless(rawText);
  } catch {
    res.status(400).json({
      success: false,
      error: 'Invalid JSON payload.',
    });
    return;
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    res.status(400).json({
      success: false,
      error: 'Invalid webhook payload structure.',
    });
    return;
  }

  // Extract installation ID losslessly (no unsafe Number conversion).
  const installationId = extractInstallationIdLossless(payload);

  req.githubDeliveryId = deliveryId;
  req.githubEventType = eventType;
  req.githubPayload = payload;
  req.githubPayloadText = rawText;
  req.githubSignature = signatureHeader;
  req.githubInstallationId = installationId;

  next();
}