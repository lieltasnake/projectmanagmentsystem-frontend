-- 035_create_github_webhook_deliveries.sql
-- Additive: ensures github_webhook_deliveries has columns needed for webhook delivery
-- tracking, processing timestamps, and repository scoping.
-- Existing columns (id, delivery_id, installation_id, event_type, payload, status,
-- attempts, last_error, created_at, updated_at, arrival_order) are preserved unchanged.
-- existing status CHECK constraint and DEFAULT 'pending' are preserved unchanged.
-- existing PRIMARY KEY (id) and UNIQUE (delivery_id) are preserved unchanged.

BEGIN;

ALTER TABLE github_webhook_deliveries
  ADD COLUMN IF NOT EXISTS repository_id BIGINT NULL;

ALTER TABLE github_webhook_deliveries
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ NULL;

ALTER TABLE github_webhook_deliveries
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('035_create_github_webhook_deliveries.sql', NOW())
ON CONFLICT (filename) DO NOTHING;

COMMIT;
