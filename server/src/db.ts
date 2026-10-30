import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

const poolConfig: PoolConfig = connectionString
  ? { connectionString }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'pms_db',
    };

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err.message);
});

/**
 * Checks PostgreSQL connectivity safely.
 */
export async function checkDbConnection(): Promise<{ connected: boolean; timestamp?: string; error?: string }> {
  try {
    const result = await pool.query('SELECT NOW() AS now');
    return {
      connected: true,
      timestamp: result.rows[0]?.now?.toISOString() || new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      connected: false,
      error: 'Database connection failed',
    };
  }
}

/**
 * Safe database migrations:
 * 1. Checks if the existing `users_role_check` constraint supports the 'TESTER' role and adds it if needed.
 * 2. Adds user management columns to `users`: `team`, `is_active`, `must_change_password`, `updated_at`.
 * 3. Preserves all existing tables and records.
 */
export async function runSafeMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    // 1. Role constraint migration
    const res = await client.query(`
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'users'::regclass AND conname = 'users_role_check';
    `);

    const currentDef = res.rows[0]?.def || '';
    if (!currentDef.includes('TESTER')) {
      console.log('🔄 Running safe migration: Adding TESTER role to users_role_check...');
      await client.query('BEGIN');
      await client.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;');
      await client.query(`
        ALTER TABLE users ADD CONSTRAINT users_role_check
        CHECK (role IN ('PM', 'TL', 'TM', 'TESTER'));
      `);
      await client.query('COMMIT');
      console.log('✅ Safe migration completed: TESTER role is now supported.');
    } else {
      console.log('✅ Role constraint verification: TESTER role is supported.');
    }

    // 2. Add User Management columns
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS team VARCHAR(100) DEFAULT 'General';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);

    // Ensure initial default teams for pre-existing accounts
    await client.query(`
      UPDATE users SET team = 'Management' WHERE email = 'pm@pms.local' AND (team IS NULL OR team = 'General');
      UPDATE users SET team = 'Engineering' WHERE email IN ('tl@pms.local', 'tm@pms.local') AND (team IS NULL OR team = 'General');
    `);

    console.log('✅ User management columns verified on "users" table.');
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('⚠️ Safe migration check error:', err.message);
  } finally {
    client.release();
  }
}
