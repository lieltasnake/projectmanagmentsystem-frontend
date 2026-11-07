-- 030_create_github_pr_sync_runs.sql
-- Additive: Synchronization run tracking for PR synchronization.
-- Tracks per-repository PR synchronization status and counts.

BEGIN;

CREATE TABLE IF NOT EXISTS github_pr_sync_runs (
  id BIGSERIAL PRIMARY KEY,
  installation_id BIGINT NOT NULL,
  repository_id BIGINT NOT NULL,
  sync_run_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('running','complete','failed','truncated')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  fetched_count INTEGER NOT NULL DEFAULT 0,
  upserted_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  CONSTRAINT uq_github_pr_sync_runs_unique_run
    UNIQUE (installation_id, repository_id, sync_run_id),
  CONSTRAINT fk_github_pr_sync_runs_installation
    FOREIGN KEY (installation_id)
    REFERENCES github_installations (installation_id) ON DELETE RESTRICT,
  CONSTRAINT fk_github_pr_sync_runs_repositories
    FOREIGN KEY (installation_id, repository_id)
    REFERENCES github_repositories (installation_id, github_repo_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_github_pr_sync_runs_installation
    ON github_pr_sync_runs (installation_id);
CREATE INDEX IF NOT EXISTS idx_github_pr_sync_runs_repository
    ON github_pr_sync_runs (repository_id);
CREATE INDEX IF NOT EXISTS idx_github_pr_sync_runs_status
    ON github_pr_sync_runs (status);
CREATE INDEX IF NOT EXISTS idx_github_pr_sync_runs_sync_run_id
    ON github_pr_sync_runs (sync_run_id);

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('030_create_github_pr_sync_runs.sql', NOW())
ON CONFLICT (filename) DO NOTHING;

COMMIT;