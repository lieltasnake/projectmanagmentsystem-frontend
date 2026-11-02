-- 019_add_bug_verification_columns.sql
-- Additive only: add verification tracking columns to bugs table.
-- Preserves existing data.

ALTER TABLE bugs ADD COLUMN IF NOT EXISTS verified_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_bugs_verified_by ON bugs(verified_by);
CREATE INDEX IF NOT EXISTS idx_bugs_verified_at ON bugs(verified_at);
