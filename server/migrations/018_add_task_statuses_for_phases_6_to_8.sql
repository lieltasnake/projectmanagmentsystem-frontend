-- 018_add_task_statuses_for_phases_6_to_8.sql
-- Additive only: extend the tasks_status_check constraint to permit the
-- Phase 6-8 lifecycle statuses CHANGES_REQUESTED, BUG_FIX_REQUIRED,
-- and READY_FOR_APPROVAL. Preserves existing data.
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
    'ON_HOLD'::character varying,
    'CHANGES_REQUESTED'::character varying,
    'BUG_FIX_REQUIRED'::character varying,
    'READY_FOR_APPROVAL'::character varying
  ])::text[])));
