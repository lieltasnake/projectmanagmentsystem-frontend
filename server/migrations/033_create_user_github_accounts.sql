-- 033_create_user_github_accounts.sql
-- Additive: maps PMS users to GitHub identities (identity-only, no access tokens stored).
-- github_user_id is globally unique to prevent identity transfer between PMS users.
-- Identity-only OAuth flow: GitHub access token is exchanged in-memory only and never persisted.

BEGIN;

CREATE TABLE IF NOT EXISTS user_github_accounts (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    github_user_id BIGINT NOT NULL,
    github_login VARCHAR(255) NOT NULL,
    github_avatar_url TEXT,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_synced_at TIMESTAMPTZ NULL,
    
    CONSTRAINT uq_github_user_global UNIQUE (github_user_id),
    
    CONSTRAINT fk_user_github_user 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- user_id index retained (not covered by any unique constraint)
CREATE INDEX idx_user_github_accounts_user_id 
  ON user_github_accounts(user_id);

-- github_user_id index NOT created separately -- covered by uq_github_user_global UNIQUE constraint

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('033_create_user_github_accounts.sql', NOW())
ON CONFLICT (filename) DO NOTHING;

COMMIT;
