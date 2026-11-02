-- 014_additive_task_management_hardening.sql
-- Additive only. Preserves existing data.

-- 1. Add author_id to task_comments for traceability (nullable for legacy rows)
ALTER TABLE task_comments ADD COLUMN IF NOT EXISTS author_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_task_comments_author_id ON task_comments(author_id);

-- 2. Ensure task_attachments has an index on uploaded_by (already may exist)
CREATE INDEX IF NOT EXISTS idx_task_attachments_uploaded_by ON task_attachments(uploaded_by);

-- 3. Ensure subtasks order index
CREATE INDEX IF NOT EXISTS idx_subtasks_task_order ON subtasks(task_id, "order");
