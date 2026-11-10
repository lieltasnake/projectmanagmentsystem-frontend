-- 034_create_github_commit_task_links.sql
-- Additive: links GitHub commits to PMS tasks.
-- task_id is INTEGER to match tasks.id (verified via migrations 005 and 013).
-- project_id is INTEGER to match projects.id.
-- Composite FK references github_commits(installation_id, repository_id, commit_sha)
-- which has UNIQUE constraint (verified via migration 027:22).
-- Column types verified: installation_id BIGINT, repository_id BIGINT, commit_sha VARCHAR(64).
-- Cross-project integrity enforced by transactional application validation
-- (composite FK on tasks is impractical due to tasks lacking UNIQUE (id, project_id)).

BEGIN;

CREATE TABLE IF NOT EXISTS github_commit_task_links (
    id BIGSERIAL PRIMARY KEY,
    installation_id BIGINT NOT NULL,
    repository_id BIGINT NOT NULL,
    commit_sha VARCHAR(64) NOT NULL,
    task_id INTEGER NOT NULL,
    project_id INTEGER NOT NULL,
    link_type VARCHAR(20) NOT NULL DEFAULT 'automatic'
      CHECK (link_type IN ('manual', 'automatic')),
    linked_by BIGINT NULL,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_commit_task UNIQUE (installation_id, repository_id, commit_sha, task_id),
    
    CONSTRAINT fk_commit_task_commit 
        FOREIGN KEY (installation_id, repository_id, commit_sha) 
        REFERENCES github_commits(installation_id, repository_id, commit_sha) 
        ON DELETE RESTRICT,
    
    CONSTRAINT fk_commit_task_task 
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    
    CONSTRAINT fk_commit_task_project 
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    
    CONSTRAINT fk_commit_task_user 
        FOREIGN KEY (linked_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_commit_task_links_commit_sha 
  ON github_commit_task_links(commit_sha);

CREATE INDEX idx_commit_task_links_task_id 
  ON github_commit_task_links(task_id);

CREATE INDEX idx_commit_task_links_installation_repo 
  ON github_commit_task_links(installation_id, repository_id);

CREATE INDEX idx_commit_task_links_project_id 
  ON github_commit_task_links(project_id);

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('034_create_github_commit_task_links.sql', NOW())
ON CONFLICT (filename) DO NOTHING;

COMMIT;
