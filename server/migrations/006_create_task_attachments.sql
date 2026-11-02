-- 006_create_task_attachments.sql
-- Attachments linked to a task (screenshots, documents, videos, etc.).
-- The actual file storage is handled by the application layer;
-- this table stores metadata and a reference URL/path.
CREATE TABLE IF NOT EXISTS task_attachments (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    size BIGINT NOT NULL DEFAULT 0,
    type VARCHAR(100),
    file_url VARCHAR(1000),
    uploaded_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id);