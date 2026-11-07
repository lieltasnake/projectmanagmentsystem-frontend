-- 031_create_github_prs.sql
-- Additive: GitHub pull request metadata synchronized from connected repositories.
-- One record per (installation_id, repository_id, github_pr_id).
-- Author information and PR metadata stored for reference.

BEGIN;

CREATE TABLE IF NOT EXISTS github_prs (
  id BIGSERIAL PRIMARY KEY,
  installation_id BIGINT NOT NULL,
  repository_id BIGINT NOT NULL,
  github_pr_id BIGINT NOT NULL,
  pr_number INTEGER NOT NULL CHECK (pr_number > 0),
  title TEXT NOT NULL,
  body TEXT,
  state VARCHAR(20) NOT NULL CHECK (state IN ('open', 'closed')),
  draft BOOLEAN NOT NULL DEFAULT FALSE,
  head_branch TEXT NOT NULL,
  base_branch TEXT NOT NULL,
  head_sha TEXT,
  base_sha TEXT,
  author_github_id BIGINT,
  author_login TEXT,
  created_at_github TIMESTAMPTZ NOT NULL,
  updated_at_github TIMESTAMPTZ NOT NULL,
  closed_at_github TIMESTAMPTZ,
  merged_at_github TIMESTAMPTZ,
  html_url TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_github_prs_installation_repo_pr UNIQUE (installation_id, repository_id, github_pr_id),
  CONSTRAINT uq_github_prs_installation_repo_number UNIQUE (installation_id, repository_id, pr_number),
  CONSTRAINT fk_github_prs_installation
    FOREIGN KEY (installation_id)
    REFERENCES github_installations (installation_id) ON DELETE RESTRICT,
  CONSTRAINT fk_github_prs_repositories
    FOREIGN KEY (installation_id, repository_id)
    REFERENCES github_repositories (installation_id, github_repo_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_github_prs_installation_id ON github_prs (installation_id);
CREATE INDEX IF NOT EXISTS idx_github_prs_repository_id ON github_prs (repository_id);
CREATE INDEX IF NOT EXISTS idx_github_prs_state ON github_prs (state);
CREATE INDEX IF NOT EXISTS idx_github_prs_author_login ON github_prs (author_login);
CREATE INDEX IF NOT EXISTS idx_github_prs_head_branch ON github_prs (head_branch);
CREATE INDEX IF NOT EXISTS idx_github_prs_base_branch ON github_prs (base_branch);

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('031_create_github_prs.sql', NOW())
ON CONFLICT (filename) DO NOTHING;

COMMIT;