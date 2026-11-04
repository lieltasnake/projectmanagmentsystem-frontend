-- 022_create_roles_catalog.sql
-- Additive: create roles catalog for dynamic role management.
-- Preserves all existing data; does not modify users.role or permission logic.
-- No automatic permission grants when creating roles (catalog only).
CREATE TABLE IF NOT EXISTS roles_catalog (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roles_catalog_name ON roles_catalog(LOWER(name));

-- Seed existing system roles if not present (no changes to existing behavior)
INSERT INTO roles_catalog (name, description, is_system)
VALUES 
  ('Project Manager', 'Project governance and final approval authority', TRUE),
  ('Team Leader', 'Task review and recommendation authority', TRUE),
  ('Team Member', 'Task execution and submission', TRUE),
  ('Tester', 'Bug reporting and verification', TRUE)
ON CONFLICT (name) DO NOTHING;
