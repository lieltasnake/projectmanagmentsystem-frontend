-- 016_phase1_task_lifecycle.sql
-- Additive only. Preserves existing data.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS first_viewed_at TIMESTAMP;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS on_hold_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_first_viewed_at ON tasks(first_viewed_at);
