-- 027_create_github_commits.sql
-- Additive: GitHub commit metadata synchronized from connected repositories.
-- One record per (installation_id, repository_id, commit_sha).
-- Author/committer information and message stored for reference.

BEGIN;

CREATE TABLE IF NOT EXISTS github_commits (
  id BIGSERIAL PRIMARY KEY,
  installation_id BIGINT NOT NULL,
  repository_id BIGINT NOT NULL,
  commit_sha VARCHAR(64) NOT NULL,
  author_name VARCHAR(255),
  author_email VARCHAR(255),
  author_date TIMESTAMPTZ,
  committer_name VARCHAR(255),
  committer_email VARCHAR(255),
  committer_date TIMESTAMPTZ,
  message TEXT,
  html_url TEXT,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_github_commits_installation_repo_sha UNIQUE (installation_id, repository_id, commit_sha),
  CONSTRAINT fk_github_commits_installation FOREIGN KEY (installation_id)
    REFERENCES github_installations (installation_id) ON DELETE RESTRICT,
  CONSTRAINT fk_github_commits_repositories FOREIGN KEY (installation_id, repository_id)
    REFERENCES github_repositories (installation_id, github_repo_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_github_commits_installation_id ON github_commits (installation_id);
CREATE INDEX IF NOT EXISTS idx_github_commits_repository_id ON github_commits (repository_id);
CREATE INDEX IF NOT EXISTS idx_github_commits_commit_sha ON github_commits (commit_sha);

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('027_create_github_commits.sql', NOW())
ON CONFLICT (filename) DO NOTHING;

COMMIT;