-- 017_allow_seen_and_on_hold_statuses.sql
-- Additive only: extend the tasks_status_check constraint to permit the
-- Phase 1 lifecycle statuses SEEN and ON_HOLD. Preserves existing data.
-- Idempotent: drops then re-adds the constraint within one transaction.

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_status_check
  CHECK (((status)::text = ANY ((ARRAY[
    'TODO'::character varying,
    'IN_PROGRESS'::character varying,
    'REVIEW'::character varying,
    'DONE'::character varying,
    'SEEN'::character varying,
    'ON_HOLD'::character varying
  ])::text[])));
