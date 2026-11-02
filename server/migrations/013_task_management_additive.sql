-- Migration 013: Additive Task Management schema extensions
-- Stage 6A approved design. NO drops/recreates. Preserves existing data.

-- 1. Create task_submissions table (versioned submissions)
CREATE TABLE IF NOT EXISTS task_submissions (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  submitted_role VARCHAR(20),
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  demo_url VARCHAR(500),
  description TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (task_id, version)
);

CREATE INDEX IF NOT EXISTS idx_task_submissions_task_id ON task_submissions(task_id);

-- 2. Additive columns to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS approved_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS submission_id INTEGER;

-- 3. Foreign key: tasks.submission_id -> task_submissions.id (safe, nullable)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_submission_id_fkey'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_submission_id_fkey
      FOREIGN KEY (submission_id) REFERENCES task_submissions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Add submission_id to task_reviews
ALTER TABLE task_reviews ADD COLUMN IF NOT EXISTS submission_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_reviews_submission_id_fkey'
  ) THEN
    ALTER TABLE task_reviews
      ADD CONSTRAINT task_reviews_submission_id_fkey
      FOREIGN KEY (submission_id) REFERENCES task_submissions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. Update task_reviews action CHECK to include 'resubmit'
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_reviews_action_check') THEN
    ALTER TABLE task_reviews DROP CONSTRAINT task_reviews_action_check;
  END IF;
  ALTER TABLE task_reviews
    ADD CONSTRAINT task_reviews_action_check
    CHECK (action IN ('submit','request_corrections','recommend_approval','final_approve','fail_testing','pass_testing','resubmit'));
END $$;

-- 6. Backfill deadline from due_date (no data loss)
UPDATE tasks SET deadline = COALESCE(deadline, due_date) WHERE deadline IS NULL;

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_id ON tasks(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON tasks(deleted_at);
CREATE INDEX IF NOT EXISTS idx_task_reviews_submission_id ON task_reviews(submission_id);

-- Note: author_id (bigint) and submitted_by (bigint) types are kept as-is
-- because their FKs to users(id) work correctly. No type conversion performed.
