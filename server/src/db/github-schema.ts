// GitHub integration schema helpers (Stage 1 + Stage 2 Part 3 additive).
// Additive DDL only; no runtime auto-initialization. Use scripts/init-github-schema.ts explicitly.
//
// Canonical installation identifier for locks/FIFO/processing: GitHub external installation ID (BIGINT)
// as stored in github_webhook_deliveries.installation_id and github_installations.installation_id.
// github_installations.id is the internal DB primary key only.

export interface PoolClientLike {
  query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number }>;
}

async function tableExists(client: PoolClientLike, table: string): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_name = $1 AND table_type = 'BASE TABLE'
     LIMIT 1`,
    [table]
  );
  return r.rows.length > 0;
}

export async function githubInstallationsTableExists(client: PoolClientLike): Promise<boolean> {
  return tableExists(client, 'github_installations');
}

export async function githubWebhookDeliveriesTableExists(client: PoolClientLike): Promise<boolean> {
  return tableExists(client, 'github_webhook_deliveries');
}

export async function githubWorkerLeasesTableExists(client: PoolClientLike): Promise<boolean> {
  return tableExists(client, 'github_worker_leases');
}

export async function githubNonceConsumptionTableExists(client: PoolClientLike): Promise<boolean> {
  return tableExists(client, 'github_nonce_consumption');
}

export async function githubInstallationLocksTableExists(client: PoolClientLike): Promise<boolean> {
  return tableExists(client, 'github_installation_locks');
}

export async function ensureGithubTables(client: PoolClientLike): Promise<void> {
  // Stage 1: installations (PM-owned GitHub App installations)
  await client.query(`
    CREATE TABLE IF NOT EXISTS github_installations (
      id BIGSERIAL PRIMARY KEY,
      installation_id BIGINT NOT NULL UNIQUE, -- GitHub external installation ID (canonical for locks/FIFO)
      pm_user_id BIGINT NOT NULL,
      account_login VARCHAR(255),
      account_type VARCHAR(64),
      target_type VARCHAR(64),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_github_installations_pm_user ON github_installations (pm_user_id, is_active)`
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_github_installations_installation_id ON github_installations (installation_id)`
  );

  // Stage 1: webhook deliveries with dedupe by delivery_id
  await client.query(`
    CREATE TABLE IF NOT EXISTS github_webhook_deliveries (
      id BIGSERIAL PRIMARY KEY,
      delivery_id VARCHAR(255) NOT NULL UNIQUE,
      installation_id BIGINT, -- canonical GitHub external installation ID
      event_type VARCHAR(128) NOT NULL,
      payload JSONB NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_github_webhook_deliveries_status ON github_webhook_deliveries (status, updated_at)`
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_github_webhook_deliveries_installation ON github_webhook_deliveries (installation_id)`
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_github_webhook_deliveries_processing ON github_webhook_deliveries (status, installation_id) WHERE status = 'processing'`
  );

  // Stage 2 Part 3 (additive): reliable FIFO sequencing per installation.
  await client.query(`CREATE SEQUENCE IF NOT EXISTS github_webhook_delivery_arrival_seq`);
  await client.query(
    `ALTER TABLE github_webhook_deliveries ADD COLUMN IF NOT EXISTS arrival_order BIGINT`
  );
  await client.query(
    `ALTER TABLE github_webhook_deliveries ALTER COLUMN arrival_order SET DEFAULT nextval('github_webhook_delivery_arrival_seq')`
  );
  await client.query(
    `UPDATE github_webhook_deliveries SET arrival_order = id WHERE arrival_order IS NULL`
  );
  // Enforce NOT NULL only when safe (additive hardening).
  await client.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'github_webhook_deliveries'
          AND column_name = 'arrival_order' AND is_nullable = 'YES'
      ) AND NOT EXISTS (
        SELECT 1 FROM github_webhook_deliveries WHERE arrival_order IS NULL
      ) THEN
        ALTER TABLE github_webhook_deliveries ALTER COLUMN arrival_order SET NOT NULL;
      END IF;
    END $$;
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_installation_arrival ON github_webhook_deliveries (installation_id, arrival_order)`
  );

  // Stage 1: delivery-scoped worker leases (ownership/finalization invariants preserved)
  await client.query(`
    CREATE TABLE IF NOT EXISTS github_worker_leases (
      id BIGSERIAL PRIMARY KEY,
      worker_id VARCHAR(255) NOT NULL,
      lease_owner_id VARCHAR(255) NOT NULL,
      installation_id BIGINT,
      delivery_id VARCHAR(255) NOT NULL,
      locked_until TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_github_worker_leases_worker_delivery ON github_worker_leases (worker_id, delivery_id)`
  );
  await client.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_github_worker_leases_delivery_owner ON github_worker_leases (delivery_id, lease_owner_id)`
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_github_worker_leases_locked_until ON github_worker_leases (locked_until)`
  );

  // Stage 1/2: nonce consumption (atomic one-time use)
  await client.query(`
    CREATE TABLE IF NOT EXISTS github_nonce_consumption (
      nonce_hash VARCHAR(128) PRIMARY KEY,
      installation_id BIGINT,
      pm_user_id BIGINT,
      consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ
    )
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_github_nonce_consumption_expires ON github_nonce_consumption (expires_at)`
  );

  // Stage 2 Part 3: installation-level locks (canonical GitHub external installation ID)
  await client.query(`
    CREATE TABLE IF NOT EXISTS github_installation_locks (
      installation_id BIGINT PRIMARY KEY,
      lock_token VARCHAR(256) NOT NULL,
      owner_id VARCHAR(256) NOT NULL,
      acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_github_installation_locks_expires ON github_installation_locks (expires_at)`
  );

  // Additive FK only when safe (do not add destructive cascades; avoid breaking existing data).
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_github_webhook_deliveries_installation'
      ) AND NOT EXISTS (
        SELECT 1 FROM github_webhook_deliveries d
        WHERE d.installation_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM github_installations i WHERE i.installation_id = d.installation_id)
      ) THEN
        ALTER TABLE github_webhook_deliveries
          ADD CONSTRAINT fk_github_webhook_deliveries_installation
          FOREIGN KEY (installation_id) REFERENCES github_installations(installation_id)
          ON DELETE RESTRICT NOT VALID;
      END IF;
    END $$;
  `);
}
