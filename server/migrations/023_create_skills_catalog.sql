-- 023_create_skills_catalog.sql
-- Additive: create skills catalog for dynamic skill management.
-- Preserves all existing data; users.skills (comma-separated) remains unchanged.
CREATE TABLE IF NOT EXISTS skills_catalog (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skills_catalog_name ON skills_catalog(LOWER(name));
