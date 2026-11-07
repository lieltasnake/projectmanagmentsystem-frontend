-- 025_create_github_repositories.sql
-- Additive: GitHub repository metadata synchronized from connected installations.
-- Repositories are stored under their GitHub installation (no PMS project association yet).
-- Records are preserved when repositories disappear from GitHub responses (no automatic deletes).
-- GitHub repository IDs are BIGINT; application code must preserve exact decimal string values.

BEGIN;

CREATE TABLE IF NOT EXISTS github_repositories (
  id BIGSERIAL PRIMARY KEY,
  installation_id BIGINT NOT NULL, -- canonical GitHub external installation ID
  github_repo_id BIGINT NOT NULL,  -- GitHub repository ID (preserve exact value; BIGINT-safe at app boundary)
  name VARCHAR(255) NOT NULL,
  full_name VARCHAR(512) NOT NULL,
  owner_login VARCHAR(255),
  private BOOLEAN NOT NULL DEFAULT FALSE,
  default_branch VARCHAR(255),
  html_url TEXT,
  description TEXT,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  github_created_at TIMESTAMPTZ,
  github_updated_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_github_repositories_installation_repo UNIQUE (installation_id, github_repo_id),
  CONSTRAINT fk_github_repositories_installation
    FOREIGN KEY (installation_id)
    REFERENCES github_installations (installation_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_github_repositories_installation_id
  ON github_repositories (installation_id);

CREATE INDEX IF NOT EXISTS idx_github_repositories_installation_full_name
  ON github_repositories (installation_id, full_name);

CREATE INDEX IF NOT EXISTS idx_github_repositories_github_repo_id
  ON github_repositories (github_repo_id);

CREATE INDEX IF NOT EXISTS idx_github_repositories_last_synced_at
  ON github_repositories (last_synced_at);

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('025_create_github_repositories.sql', NOW())
ON CONFLICT (filename) DO NOTHING;

COMMIT;
