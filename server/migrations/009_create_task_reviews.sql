-- 009_create_task_reviews.sql
-- Task reviews: audit trail of all review actions (submit, request corrections,
-- recommend approval, final approve, fail testing, pass testing).
-- Role-based enforcement (PM-only final approval, TL-only review actions)
-- is handled in the application layer.
CREATE TABLE IF NOT EXISTS task_reviews (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    author_name VARCHAR(255) NOT NULL,
    author_role VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL
        CHECK (action IN (
            'submit',
            'request_corrections',
            'recommend_approval',
            'final_approve',
            'fail_testing',
            'pass_testing'
        )),
    comment TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_reviews_task ON task_reviews(task_id);