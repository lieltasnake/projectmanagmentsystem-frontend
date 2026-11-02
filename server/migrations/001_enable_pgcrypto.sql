-- 001_enable_pgcrypto.sql
-- Enables the pgcrypto extension for gen_random_uuid() support.
-- Safe to run multiple times (IF NOT EXISTS).
CREATE EXTENSION IF NOT EXISTS pgcrypto;