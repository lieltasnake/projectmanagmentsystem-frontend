-- 029_create_github_commit_sync_runs.sql
-- Additive: Synchronization run tracking for commit synchronization.
-- Tracks per-branch synchronization status and counts.

BEGIN;

CREATE TABLE IF NOT EXISTS github_commit_sync_runs (
  id BIGSERIAL PRIMARY KEY,
  installation_id BIGINT NOT NULL,
  repository_id BIGINT NOT NULL,
  branch_name TEXT NOT NULL,
  sync_run_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('running','complete','failed','truncated')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  fetched_count INTEGER NOT NULL DEFAULT 0,
  upserted_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  CONSTRAINT uq_github_commit_sync_runs_unique_run
    UNIQUE (installation_id, repository_id, branch_name, sync_run_id),
  CONSTRAINT fk_github_commit_sync_runs_installation
    FOREIGN KEY (installation_id)
    REFERENCES github_installations (installation_id) ON DELETE RESTRICT,
  CONSTRAINT fk_github_commit_sync_runs_repositories
    FOREIGN KEY (installation_id, repository_id)
    REFERENCES github_repositories (installation_id, github_repo_id) ON DELETE RESTRICT,
  CONSTRAINT fk_github_commit_sync_runs_branches
    FOREIGN KEY (installation_id, repository_id, branch_name)
    REFERENCES github_branches (installation_id, repository_id, branch_name) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_github_commit_sync_runs_installation
    ON github_commit_sync_runs (installation_id);
CREATE INDEX IF NOT EXISTS idx_github_commit_sync_runs_repository
    ON github_commit_sync_runs (repository_id);
CREATE INDEX IF NOT EXISTS idx_github_commit_sync_runs_branch
    ON github_commit_sync_runs (installation_id, repository_id, branch_name);
CREATE INDEX IF NOT EXISTS idx_github_commit_sync_runs_status
    ON github_commit_sync_runs (status);

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('029_create_github_commit_sync_runs.sql', NOW())
ON CONFLICT (filename) DO NOTHING;

COMMIT;