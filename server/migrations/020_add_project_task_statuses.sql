-- 020_add_project_task_statuses.sql
-- Additive only: per-project task statuses table + status_id FK on tasks.
-- Preserves all existing data; existing tasks.status column is NOT dropped.
-- Idempotent: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
--             INSERT ... ON CONFLICT DO NOTHING.

CREATE TABLE IF NOT EXISTS task_statuses (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(50) DEFAULT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_completion_status BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, name)
);

CREATE INDEX IF NOT EXISTS idx_task_statuses_project_id ON task_statuses(project_id);
CREATE INDEX IF NOT EXISTS idx_task_statuses_project_sort ON task_statuses(project_id, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_statuses_one_completion_per_project
  ON task_statuses(project_id) WHERE is_completion_status = TRUE;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status_id INTEGER REFERENCES task_statuses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_status_id ON tasks(status_id);

-- Default statuses for ALL existing projects (skip if already present)
INSERT INTO task_statuses (project_id, name, sort_order, color, is_system, is_completion_status)
SELECT p.id, s.name, s.sort_order, s.color, TRUE,
  CASE WHEN s.name = 'Completed' THEN TRUE ELSE FALSE END
FROM projects p
CROSS JOIN (
  VALUES
    ('Not Started', 1, NULL),
    ('In Progress', 2, NULL),
    ('Under Review', 3, NULL),
    ('Completed', 4, NULL)
) AS s(name, sort_order, color)
ON CONFLICT (project_id, name) DO NOTHING;

-- Insert any additional statuses currently used in existing tasks
-- Unknown/custom values are preserved as-is (ELSE t.status), not forced to 'Not Started'
INSERT INTO task_statuses (project_id, name, sort_order, color, is_system, is_completion_status)
SELECT DISTINCT t.project_id,
  CASE t.status
    WHEN 'TODO' THEN 'Not Started'
    WHEN 'IN_PROGRESS' THEN 'In Progress'
    WHEN 'REVIEW' THEN 'Under Review'
    WHEN 'DONE' THEN 'Completed'
    WHEN 'SEEN' THEN 'Seen'
    WHEN 'ON_HOLD' THEN 'On Hold'
    WHEN 'CHANGES_REQUESTED' THEN 'Changes Requested'
    WHEN 'BUG_FIX_REQUIRED' THEN 'Bug Fix Required'
    WHEN 'READY_FOR_APPROVAL' THEN 'Ready for Approval'
    ELSE t.status
  END,
  50, NULL, FALSE,
  FALSE
FROM tasks t
LEFT JOIN task_statuses ts
  ON ts.project_id = t.project_id
  AND ts.name = CASE t.status
    WHEN 'TODO' THEN 'Not Started'
    WHEN 'IN_PROGRESS' THEN 'In Progress'
    WHEN 'REVIEW' THEN 'Under Review'
    WHEN 'DONE' THEN 'Completed'
    WHEN 'SEEN' THEN 'Seen'
    WHEN 'ON_HOLD' THEN 'On Hold'
    WHEN 'CHANGES_REQUESTED' THEN 'Changes Requested'
    WHEN 'BUG_FIX_REQUIRED' THEN 'Bug Fix Required'
    WHEN 'READY_FOR_APPROVAL' THEN 'Ready for Approval'
    ELSE t.status
  END
WHERE ts.id IS NULL
  AND t.status IS NOT NULL
ON CONFLICT (project_id, name) DO NOTHING;

-- Map existing tasks.status text values to task_statuses.id
-- NULL statuses remain NULL in status_id (not silently changed)
-- Legacy DONE maps to Completed only when genuine PM approval evidence exists;
-- otherwise status_id stays NULL and tasks.status remains 'DONE' (unapproved).
UPDATE tasks t
SET status_id = ts.id
FROM task_statuses ts
WHERE ts.project_id = t.project_id
  AND t.status IS NOT NULL
  AND ts.name = CASE t.status
    WHEN 'TODO' THEN 'Not Started'
    WHEN 'IN_PROGRESS' THEN 'In Progress'
    WHEN 'REVIEW' THEN 'Under Review'
    WHEN 'DONE' THEN
      CASE WHEN
            t.approved_at IS NOT NULL
        AND t.approved_by_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM task_reviews tr
          JOIN users u ON u.id = tr.author_id
          WHERE tr.task_id = t.id
            AND tr.action = 'final_approve'
            AND tr.author_role = 'PM'
            AND u.role = 'PM'
            AND tr.author_id = t.approved_by_id
            AND tr.submission_id IS NOT NULL
            AND tr.submission_id = t.submission_id
        )
      THEN 'Completed' ELSE NULL END
    WHEN 'SEEN' THEN 'Seen'
    WHEN 'ON_HOLD' THEN 'On Hold'
    WHEN 'CHANGES_REQUESTED' THEN 'Changes Requested'
    WHEN 'BUG_FIX_REQUIRED' THEN 'Bug Fix Required'
    WHEN 'READY_FOR_APPROVAL' THEN 'Ready for Approval'
    ELSE t.status
  END;

-- Read-only report: tasks with NULL status_id (e.g., NULL legacy status)
-- These are NOT modified by this migration.
SELECT t.id AS task_id, t.project_id, t.title, t.status AS legacy_status
FROM tasks t
WHERE t.status_id IS NULL
  AND t.deleted_at IS NULL;
