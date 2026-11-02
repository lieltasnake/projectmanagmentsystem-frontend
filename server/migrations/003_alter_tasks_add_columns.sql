-- 003_alter_tasks_add_columns.sql
-- Adds missing columns to the existing tasks table.
-- Uses ADD COLUMN IF NOT EXISTS so re-running is safe.
-- Does NOT modify or delete any existing data.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tl_recommendation VARCHAR(50)
    CHECK (tl_recommendation IN ('recommended', 'corrections_requested'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS review_feedback TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deadline DATE;