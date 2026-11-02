-- 004_create_project_team_members.sql
-- Join table: many-to-many relationship between projects and team members (TL/TM).
-- Uses INTEGER IDs to match the existing projects and users tables.
CREATE TABLE IF NOT EXISTS project_team_members (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, user_id)
);