-- 032_create_project_github_repositories.sql
-- Additive: maps GitHub repositories to PMS projects.
-- project_id is INTEGER to match projects.id (verified via migration 004).
-- github_repo_id is BIGINT to match github_repositories.github_repo_id (verified via migration 025).
-- installation_id is BIGINT to match github_installations.installation_id (verified via migrations 025-031).
-- GitHub repository IDs are globally unique; same repo can appear under multiple installations.
-- Partial unique indexes enforce one active connection per repo across all installations,
-- while allowing reconnection after disconnect (inactive rows are exempt).
-- Repository sync service never physically deletes rows from github_repositories;
-- ON DELETE RESTRICT on installation FK is compatible with this behavior.

BEGIN;

CREATE TABLE IF NOT EXISTS project_github_repositories (
    id BIGSERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL,
    github_repo_id BIGINT NOT NULL,
    github_repo_full_name VARCHAR(512) NOT NULL,
    installation_id BIGINT NOT NULL,
    connected_by BIGINT NOT NULL,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    disconnected_at TIMESTAMPTZ NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    auto_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    
    CONSTRAINT fk_project_github_project 
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    
    CONSTRAINT fk_project_github_user 
        FOREIGN KEY (connected_by) REFERENCES users(id) ON DELETE RESTRICT,
    
    CONSTRAINT fk_project_github_installation 
        FOREIGN KEY (installation_id) REFERENCES github_installations(installation_id) ON DELETE RESTRICT,
    
    CONSTRAINT fk_project_github_repo 
        FOREIGN KEY (installation_id, github_repo_id) 
        REFERENCES github_repositories(installation_id, github_repo_id) ON DELETE RESTRICT
);

-- One active repo per project (partial: inactive rows exempt, allows reconnection)
CREATE UNIQUE INDEX uq_project_github_repo_active
  ON project_github_repositories(project_id, github_repo_id)
  WHERE is_active = TRUE;

-- One active project per GitHub repo globally (partial: inactive rows exempt, allows reconnection)
-- GitHub repo IDs are globally unique; same repo under multiple installations still maps to one project.
CREATE UNIQUE INDEX uq_github_repo_project_active
  ON project_github_repositories(github_repo_id)
  WHERE is_active = TRUE;

CREATE INDEX idx_project_github_repo_project_id 
  ON project_github_repositories(project_id);

CREATE INDEX idx_project_github_repo_installation_id 
  ON project_github_repositories(installation_id);

CREATE INDEX idx_project_github_repo_active 
  ON project_github_repositories(is_active) WHERE is_active = TRUE;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('032_create_project_github_repositories.sql', NOW())
ON CONFLICT (filename) DO NOTHING;

COMMIT;
