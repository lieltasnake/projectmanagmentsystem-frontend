-- 026_create_github_branches.sql
-- Additive: GitHub branch metadata synchronized from connected installation repositories.
-- Branches are stored per repository (installation_id, repository_id) with exact branch names and commit SHAs.
-- Records are preserved when branches disappear from GitHub responses (no automatic deletes).
-- Branch names are stored as TEXT to preserve exact values including slashes and Unicode.
-- A sync_run_id column tracks which synchronization batch inserted or updated a branch.

BEGIN;

CREATE TABLE IF NOT EXISTS github_branches (
  id BIGSERIAL PRIMARY KEY,
  installation_id BIGINT NOT NULL,          -- canonical GitHub external installation ID
  repository_id BIGINT NOT NULL,           -- GitHub repository ID (BIGINT, exact value preserved)
  branch_name TEXT NOT NULL,               -- exact GitHub branch name (may contain slashes, Unicode)
  commit_sha VARCHAR(64) NOT NULL,         -- 40‑character hex commit SHA (exact value)
  protected BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  sync_run_id UUID,
  CONSTRAINT uq_github_branches_installation_repo_branch UNIQUE (installation_id, repository_id, branch_name),
  CONSTRAINT fk_github_branches_installation FOREIGN KEY (installation_id)
    REFERENCES github_installations (installation_id) ON DELETE RESTRICT,
  CONSTRAINT fk_github_branches_repositories FOREIGN KEY (installation_id, repository_id)
    REFERENCES github_repositories (installation_id, github_repo_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_github_branches_installation_id ON github_branches (installation_id);
CREATE INDEX IF NOT EXISTS idx_github_branches_repository_id ON github_branches (repository_id);
CREATE INDEX IF NOT EXISTS idx_github_branches_branch_name ON github_branches (branch_name);
CREATE INDEX IF NOT EXISTS idx_github_branches_last_synced_at ON github_branches (last_synced_at);
CREATE INDEX IF NOT EXISTS idx_github_branches_sync_run_id ON github_branches (sync_run_id);

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('026_create_github_branches.sql', NOW())
ON CONFLICT (filename) DO NOTHING;

COMMIT;
