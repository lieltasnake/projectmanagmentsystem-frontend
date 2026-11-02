-- 010_create_bugs.sql
-- Bugs table: defects reported by Testers, assigned to Team Members for resolution.
-- Bugs reference both the task and the project for flexible querying.
CREATE TABLE IF NOT EXISTS bugs (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    severity VARCHAR(50) NOT NULL DEFAULT 'Medium'
        CHECK (severity IN ('Critical', 'High', 'Medium', 'Low')),
    reproduction_steps TEXT,
    assigned_to BIGINT REFERENCES users(id) ON DELETE SET NULL,
    reported_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(50) NOT NULL DEFAULT 'Open'
        CHECK (status IN (
            'Open', 'Assigned', 'In Progress', 'Fixed',
            'Retesting', 'Verified', 'Reopened'
        )),
    resolution_notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bugs_task ON bugs(task_id);
CREATE INDEX IF NOT EXISTS idx_bugs_project ON bugs(project_id);
CREATE INDEX IF NOT EXISTS idx_bugs_assigned_to ON bugs(assigned_to);
CREATE INDEX IF NOT EXISTS idx_bugs_reported_by ON bugs(reported_by);
CREATE INDEX IF NOT EXISTS idx_bugs_status ON bugs(status);