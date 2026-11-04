-- 021_relax_tasks_status_check.sql
-- Relax the tasks_status_check constraint to permit custom project-specific
-- status names written to tasks.status.
-- Additive only: drops then re-adds the constraint within one transaction.
-- Does not change tasks.status nullability. Does not rewrite any row data.
-- Existing legacy statuses remain valid; NULL statuses remain allowed.

BEGIN;

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_status_check
  CHECK (status IS NULL OR length(btrim(status)) > 0);

COMMIT;
