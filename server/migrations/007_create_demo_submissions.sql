-- 007_create_demo_submissions.sql
-- Demo submissions: a Team Member submits a working demo link for a task
-- as part of the review workflow.
CREATE TABLE IF NOT EXISTS demo_submissions (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    demo_url VARCHAR(1000),
    description TEXT,
    submitted_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    submitted_role VARCHAR(50),
    submitted_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_submissions_task ON demo_submissions(task_id);