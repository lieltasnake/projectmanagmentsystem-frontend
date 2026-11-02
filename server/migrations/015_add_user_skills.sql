-- 015_add_user_skills.sql
-- Additive: store each user's saved skills on the users table.
-- Existing users keep NULL skills (no skills are invented).
-- Skills are stored as a comma-separated list of skill names.
ALTER TABLE users ADD COLUMN IF NOT EXISTS skills TEXT;

CREATE INDEX IF NOT EXISTS idx_users_skills ON users USING gin(to_tsvector('english', COALESCE(skills, '')));
