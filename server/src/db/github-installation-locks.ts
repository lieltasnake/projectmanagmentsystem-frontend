// Stage 2 Part 3: installation lock DDL (additive). Prefer ensureGithubTables() from github-schema.ts.
// Traceability file MUST remain consistent with github-schema.ts.

export const GITHUB_INSTALLATION_LOCKS_DDL = `
CREATE TABLE IF NOT EXISTS github_installation_locks (
  installation_id BIGINT PRIMARY KEY, -- canonical GitHub external installation ID
  lock_token VARCHAR(256) NOT NULL,
  owner_id VARCHAR(256) NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_github_installation_locks_expires ON github_installation_locks (expires_at);
`;
