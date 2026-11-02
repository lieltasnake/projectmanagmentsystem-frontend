-- 011_create_bug_attachments.sql
-- Attachments linked to a bug (screenshots, logs, etc. as evidence).
CREATE TABLE IF NOT EXISTS bug_attachments (
    id SERIAL PRIMARY KEY,
    bug_id INTEGER NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    size BIGINT NOT NULL DEFAULT 0,
    type VARCHAR(100),
    file_url VARCHAR(1000),
    uploaded_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bug_attachments_bug ON bug_attachments(bug_id);