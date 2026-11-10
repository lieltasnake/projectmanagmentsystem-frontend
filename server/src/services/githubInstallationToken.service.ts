import { generateGitHubAppJwt } from './githubInstallationSecurity.service';
import { InstallationIdLike, normalizeInstallationId } from './installationLock.service';

export interface InstallationAccessToken {
  token: string;
  expiresAt: string; // ISO timestamp from GitHub
  permissions?: Record<string, string>;
  repositorySelection?: string;
}

/**
 * Generates a short-lived GitHub installation access token.
 *
 * Security:
 * - Uses existing GitHub App JWT (RS256, short-lived).
 * - Requests least-privilege repository metadata access only (`metadata: read`)
 *   for listing installation repositories when supported by GitHub.
 * - For branch/commit sync, also requests `contents: read`.
 * - For PR sync, also requests `pull_requests: read`.
 * - Never logs, persists, or exposes the token outside the internal caller.
 * - Callers must not include the token in responses, logs, or storage.
 *
 * @param installationId - Canonical GitHub external installation ID (exact decimal).
 * @param requestContents - If true, requests `contents: read` permission in addition to metadata.
 *                         Used by branch/commit synchronization; repository metadata sync keeps default.
 * @param requestPullRequests - If true, requests `pull_requests: read` permission in addition to metadata.
 *                              Used by PR synchronization; repository/branch/commit sync keeps default.
 * @returns Token + expiration metadata for immediate internal use only.
 */
export async function generateInstallationAccessToken(
  installationId: InstallationIdLike,
  requestContents = false,
  requestPullRequests = false
): Promise<InstallationAccessToken> {
  const appJwt = generateGitHubAppJwt();
  const idStr = normalizeInstallationId(installationId);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    // Least privilege for GET /installation/repositories: repository metadata read.
    // For branch/commit sync, also request contents read.
    // For PR sync, also request pull_requests read.
    const permissions: Record<string, string> = {
      metadata: 'read',
    };
    if (requestContents) {
      permissions.contents = 'read';
    }
    if (requestPullRequests) {
      permissions.pull_requests = 'read';
    }
    const requestBody = JSON.stringify({ permissions });

    const resp = await fetch(
      `https://api.github.com/app/installations/${idStr}/access_tokens`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${appJwt}`,
          'Content-Type': 'application/json',
          'User-Agent': 'pms-github-integration',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: requestBody,
        signal: controller.signal,
      }
    );

    if (!resp.ok) {
      // Do not include response body in errors (may contain sensitive details).
      if (resp.status === 401) {
        throw new Error('GitHub App authentication failed when requesting installation token.');
      }
      if (resp.status === 403) {
        throw new Error(
          'GitHub App does not have sufficient permission to read repository metadata and/or branches for this installation.'
        );
      }
      if (resp.status === 404) {
        throw new Error('GitHub installation not found or not accessible to this App.');
      }
      if (resp.status === 422) {
        throw new Error(
          'repository metadata token for this installation. Verify the installation grants repository metadata and branch access.'
        );
      }
      if (resp.status === 429) {
        throw new Error('GitHub API rate limit exceeded while requesting installation token.');
      }
      throw new Error(`Failed to obtain GitHub installation token (HTTP ${resp.status}).`);
    }

    const data = (await resp.json().catch(() => null)) as any;
    if (!data || typeof data.token !== 'string' || !data.token) {
      throw new Error('GitHub installation token response missing token.');
    }
    if (typeof data.expires_at !== 'string' || !data.expires_at) {
      throw new Error('GitHub installation token response missing expiration.');
    }

    // Validate expiration is parseable (defense in depth; token is short-lived).
    const expiresMs = Date.parse(data.expires_at);
    if (!Number.isFinite(expiresMs)) {
      throw new Error('GitHub installation token response has invalid expiration.');
    }

    return {
      token: data.token,
      expiresAt: data.expires_at,
      permissions: data.permissions && typeof data.permissions === 'object' ? data.permissions : undefined,
      repositorySelection:
        typeof data.repository_selection === 'string' ? data.repository_selection : undefined,
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('Timed out while requesting GitHub installation token.');
    }
    // Re-throw sanitized errors; avoid leaking internal details.
    if (err instanceof Error) throw err;
    throw new Error('Failed to obtain GitHub installation token.');
  } finally {
    clearTimeout(timeout);
  }
}