-- 028_create_github_commit_branches.sql
-- Additive: Junction table linking commits to branches.
-- One row per (installation_id, repository_id, commit_sha, branch_name).
-- Preserves branch associations without duplicating commit metadata.

BEGIN;

CREATE TABLE IF NOT EXISTS github_commit_branches (
  id BIGSERIAL PRIMARY KEY,
  installation_id BIGINT NOT NULL,
  repository_id BIGINT NOT NULL,
  commit_sha VARCHAR(64) NOT NULL,
  branch_name TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_github_commit_branches_installation_repo_branch
    UNIQUE (installation_id, repository_id, commit_sha, branch_name),
  CONSTRAINT fk_github_commit_branches_installation
    FOREIGN KEY (installation_id)
    REFERENCES github_installations (installation_id) ON DELETE RESTRICT,
  CONSTRAINT fk_github_commit_branches_commit
    FOREIGN KEY (installation_id, repository_id, commit_sha)
    REFERENCES github_commits (installation_id, repository_id, commit_sha) ON DELETE RESTRICT,
  CONSTRAINT fk_github_commit_branches_branch
    FOREIGN KEY (installation_id, repository_id, branch_name)
    REFERENCES github_branches (installation_id, repository_id, branch_name) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_github_commit_branches_installation_id
    ON github_commit_branches (installation_id);
CREATE INDEX IF NOT EXISTS idx_github_commit_branches_repository_id
    ON github_commit_branches (repository_id);
CREATE INDEX IF NOT EXISTS idx_github_commit_branches_commit_sha
    ON github_commit_branches (commit_sha);
CREATE INDEX IF NOT EXISTS idx_github_commit_branches_branch_name
    ON github_commit_branches (branch_name);

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('028_create_github_commit_branches.sql', NOW())
ON CONFLICT (filename) DO NOTHING;

COMMIT;