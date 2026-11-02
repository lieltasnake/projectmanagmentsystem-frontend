-- 002_alter_projects_add_columns.sql
-- Adds missing columns to the existing projects table.
-- Uses ADD COLUMN IF NOT EXISTS so re-running is safe.
-- Does NOT modify or delete any existing data.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS team_leader_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS name VARCHAR(255);