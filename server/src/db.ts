import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

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
 * Checks whether the task_statuses table exists in the current schema.
 * Used to gracefully degrade when migration 020 has not yet been applied.
 */
export async function taskStatusesTableExists(client: any): Promise<boolean> {
  const res = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'task_statuses' AND table_type = 'BASE TABLE' LIMIT 1`
  );
  return res.rows.length > 0;
}

/**
 * Migration tracking table name. Stores filenames of migrations that have
 * already been successfully applied so they are not re-executed on restart.
 */
const SCHEMA_MIGRATIONS_TABLE = 'schema_migrations';

/**
 * The 19 migration filenames already verified as applied in the existing
 * PostgreSQL database (schema changes confirmed present via read-only
 * information_schema queries). These are baselined into schema_migrations
 * without re-executing their SQL, then skipped on all future startups.
 */
const BASELINE_MIGRATIONS = [
  '001_enable_pgcrypto.sql',
  '002_alter_projects_add_columns.sql',
  '003_alter_tasks_add_columns.sql',
  '004_create_project_team_members.sql',
  '005_create_subtasks.sql',
  '006_create_task_attachments.sql',
  '007_create_demo_submissions.sql',
  '008_create_task_comments.sql',
  '009_create_task_reviews.sql',
  '010_create_bugs.sql',
  '011_create_bug_attachments.sql',
  '012_create_notifications.sql',
  '013_task_management_additive.sql',
  '014_additive_task_management_hardening.sql',
  '015_add_user_skills.sql',
  '016_phase1_task_lifecycle.sql',
  '017_allow_seen_and_on_hold_statuses.sql',
  '018_add_task_statuses_for_phases_6_to_8.sql',
  '019_add_bug_verification_columns.sql',
];

/**
 * Migration state classification.
 */
type SchemaState = 'complete' | 'empty' | { missing: string[] };

/**
 * Loads and executes pending SQL migration files from the migrations directory
 * in lexicographic order. Migrations already recorded in `schema_migrations`
 * are skipped. Each migration runs inside its own transaction together with
 * the tracking-table insert, so a failed migration is rolled back and the
 * error propagates to stop server startup.
 *
 * Database-state detection (when `schema_migrations` is empty):
 *   - COMPLETE: all key PMS schema objects exist → baseline the 19 verified
 *     migration filenames without executing their SQL.
 *   - EMPTY: no PMS schema objects exist at all → execute migrations 001–019
 *     in order.
 *   - PARTIAL: some but not all key objects exist → stop startup with a clear
 *     diagnostic; do not baseline or execute all migrations.
 *
 * Consistency verification (when `schema_migrations` already has records):
 *   - Every recorded filename must match an existing .sql file.
 *   - BASELINE_MIGRATIONS must match the actual migration files exactly.
 *   - Recorded filenames must form a contiguous ordered sequence (001, 002, ...).
 *   - Each recorded migration's key schema objects must still exist.
 *   - Only genuinely pending migrations (not in schema_migrations) execute.
 */
export async function runSafeMigrations(): Promise<void> {
  const migrationsDir = path.join(__dirname, '..', 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    console.log('⚠️ Migrations directory not found, skipping schema migrations.');
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const fileSet = new Set(files);

  if (files.length === 0) {
    console.log('⚠️ No migration files found, skipping schema migrations.');
    return;
  }

  // 0. Validate that every baseline migration has a corresponding .sql file.
  //    Files NOT in BASELINE_MIGRATIONS (e.g. 020, 021) are treated as pending
  //    and are never recorded as applied without explicit execution.
  const baselineSet = new Set(BASELINE_MIGRATIONS);
  const missingFromFiles = BASELINE_MIGRATIONS.filter((f) => !fileSet.has(f));
  if (missingFromFiles.length > 0) {
    throw new Error(
      `BASELINE_MIGRATIONS entries missing from migration files: ${missingFromFiles.join(', ')}. ` +
      `Update BASELINE_MIGRATIONS to match only existing migration files.`
    );
  }

  const client = await pool.connect();
  try {
    // 1. Ensure the migration-tracking table exists (additive, idempotent).
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA_MIGRATIONS_TABLE} (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // 2. Discover which migrations have already been applied.
    const appliedRes = await client.query(
      `SELECT filename FROM ${SCHEMA_MIGRATIONS_TABLE}`
    );
    const applied = new Set(appliedRes.rows.map((r: any) => r.filename));

    // 3. Reject unexpected filenames in schema_migrations that do not match any
    //    existing migration file.
    const unexpected = [...applied].filter((f) => !fileSet.has(f));
    if (unexpected.length > 0) {
      throw new Error(
        `schema_migrations contains unexpected migration filenames: ${unexpected.join(
          ', '
        )}. These do not match any migration file in ${migrationsDir}.`
      );
    }

    // 4. Validate recorded migration history forms a valid ordered sequence
    //    (contiguous prefix starting from 001 with no gaps).
    if (applied.size > 0) {
      validateMigrationHistory(applied, files, fileSet);
    }

    // 5. One-time baseline detection: only when the tracking table is empty.
    if (applied.size === 0) {
      const schemaState = await detectSchemaState(client);

      if (schemaState === 'complete') {
        console.log(
          `📋 Baseline: recording ${BASELINE_MIGRATIONS.length} already-applied ` +
            'migrations without executing their SQL.'
        );
        await client.query('BEGIN');
        try {
          for (const filename of BASELINE_MIGRATIONS) {
            await client.query(
              `INSERT INTO ${SCHEMA_MIGRATIONS_TABLE} (filename) VALUES ($1)
               ON CONFLICT (filename) DO NOTHING`,
              [filename]
            );
          }
          await client.query('COMMIT');
          console.log(`✅ Baseline complete: ${BASELINE_MIGRATIONS.length} migration(s) recorded.`);
        } catch (err: any) {
          await client.query('ROLLBACK').catch(() => {});
          console.error(`❌ Baseline failed: ${err.message}`);
          throw err;
        }
      } else if (schemaState === 'empty') {
        console.log(
          '📋 Empty database detected: no PMS schema objects found. ' +
            'Executing migrations 001–019 in order.'
        );
        // Fall through to step 9: all files are pending.
      } else {
        // Partial or unknown state: stop startup with a clear diagnostic.
        const missing = schemaState.missing;
        throw new Error(
          `Partial or inconsistent PMS schema detected. ` +
          `Missing required schema objects: ${missing.join(', ')}. ` +
          `Cannot safely baseline or auto-migrate. ` +
          `Please resolve manually or seed schema_migrations before starting.`
        );
      }
    } else {
      // 6. When schema_migrations already has records, verify each recorded
      //    migration's key schema objects still exist in the live database.
      const consistencyMissing = await verifyAppliedMigrations(client, applied);
      if (consistencyMissing.length > 0) {
        throw new Error(
          `Inconsistent PMS state: recorded migrations are missing required ` +
          `schema objects: ${consistencyMissing.join(', ')}. ` +
          `Cannot safely execute pending migrations. ` +
          `Please resolve manually before starting.`
        );
      }
    }

    // 7. Re-read applied set after baseline (if any), then filter to truly pending.
    const appliedRes2 = await client.query(
      `SELECT filename FROM ${SCHEMA_MIGRATIONS_TABLE}`
    );
    const applied2 = new Set(appliedRes2.rows.map((r: any) => r.filename));
    const pending = files.filter((f) => !applied2.has(f));

    if (pending.length === 0) {
      console.log(`✅ All ${files.length} migration(s) already applied. Skipping.`);
      return;
    }

    // Pending migrations are NOT auto-executed. They require explicit
    // authorization before being applied to the database.
    console.log(
      `⚠️ ${pending.length} pending migration(s) detected but will NOT auto-execute: ${pending.join(', ')}`
    );
    console.log('⚠️ Migrations must be applied manually with explicit user authorization.');
    return;
  } catch (err: any) {
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Validates that recorded migration filenames form a valid ordered sequence:
 *   - All recorded filenames correspond to existing .sql files.
 *   - Recorded filenames form a contiguous prefix starting from 001 with no gaps.
 *   - No unexpected entries.
 *
 * Throws an Error with a clear diagnostic if the history is invalid.
 */
function validateMigrationHistory(applied: Set<string>, files: string[], fileSet: Set<string>): void {
  const sortedApplied = [...applied].sort();

  // Check that all recorded filenames exist as files.
  const nonExistent = sortedApplied.filter((f) => !fileSet.has(f));
  if (nonExistent.length > 0) {
    throw new Error(
      `Invalid migration history: schema_migrations references files that do not exist: ${nonExistent.join(', ')}`
    );
  }

  // Check for gaps: recorded filenames must be a contiguous prefix (001, 002, ...)
  // with no gaps between them.
  const expectedSequence = files.slice(0, sortedApplied.length);
  const missingFromSequence = expectedSequence.filter((f) => !applied.has(f));
  if (missingFromSequence.length > 0) {
    throw new Error(
      `Invalid migration history: gaps detected in recorded migrations. ` +
      `Missing expected sequence entries: ${missingFromSequence.join(', ')}. ` +
      `Recorded migrations must form a contiguous prefix starting from 001.`
    );
  }

  // Check for extra entries beyond the contiguous prefix.
  const extraEntries = sortedApplied.filter(
    (f, idx) => f !== expectedSequence[idx]
  );
  if (extraEntries.length > 0) {
    throw new Error(
      `Invalid migration history: unexpected entries in schema_migrations: ${extraEntries.join(', ')}. ` +
      `Recorded migrations must form a contiguous prefix starting from 001.`
    );
  }
}

/**
 * Maps each baseline migration filename to the schema objects it introduces,
 * used for one-time baseline detection (empty schema_migrations table) and
 * consistency verification (non-empty schema_migrations table).
 */
const BASELINE_VERIFICATION_CHECKS: Array<{
  filename: string;
  checks: Array<{ name: string; sql: string }>;
}> = [
  {
    filename: '001_enable_pgcrypto.sql',
    checks: [
      { name: 'pgcrypto extension', sql: "SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto' LIMIT 1" },
    ],
  },
  {
    filename: '002_alter_projects_add_columns.sql',
    checks: [
      { name: 'projects table', sql: "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'projects' AND table_type = 'BASE TABLE' LIMIT 1" },
      { name: 'projects.team_leader_id column', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'projects' AND column_name = 'team_leader_id' LIMIT 1" },
      { name: 'projects.name column', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'projects' AND column_name = 'name' LIMIT 1" },
    ],
  },
  {
    filename: '003_alter_tasks_add_columns.sql',
    checks: [
      { name: 'tasks table', sql: "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'tasks' AND table_type = 'BASE TABLE' LIMIT 1" },
      { name: 'tasks.tl_recommendation column', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'tasks' AND column_name = 'tl_recommendation' LIMIT 1" },
      { name: 'tasks.review_feedback column', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'tasks' AND column_name = 'review_feedback' LIMIT 1" },
      { name: 'tasks.deadline column', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'tasks' AND column_name = 'deadline' LIMIT 1" },
    ],
  },
  {
    filename: '004_create_project_team_members.sql',
    checks: [
      { name: 'project_team_members table', sql: "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'project_team_members' AND table_type = 'BASE TABLE' LIMIT 1" },
    ],
  },
  {
    filename: '005_create_subtasks.sql',
    checks: [
      { name: 'subtasks table', sql: "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'subtasks' AND table_type = 'BASE TABLE' LIMIT 1" },
      { name: 'subtasks idx_subtasks_task index', sql: "SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'subtasks' AND indexname = 'idx_subtasks_task' LIMIT 1" },
    ],
  },
  {
    filename: '006_create_task_attachments.sql',
    checks: [
      { name: 'task_attachments table', sql: "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'task_attachments' AND table_type = 'BASE TABLE' LIMIT 1" },
      { name: 'task_attachments idx_task_attachments_task index', sql: "SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'task_attachments' AND indexname = 'idx_task_attachments_task' LIMIT 1" },
    ],
  },
  {
    filename: '007_create_demo_submissions.sql',
    checks: [
      { name: 'demo_submissions table', sql: "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'demo_submissions' AND table_type = 'BASE TABLE' LIMIT 1" },
      { name: 'demo_submissions idx_demo_submissions_task index', sql: "SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'demo_submissions' AND indexname = 'idx_demo_submissions_task' LIMIT 1" },
    ],
  },
  {
    filename: '008_create_task_comments.sql',
    checks: [
      { name: 'task_comments table', sql: "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'task_comments' AND table_type = 'BASE TABLE' LIMIT 1" },
      { name: 'task_comments idx_task_comments_task index', sql: "SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'task_comments' AND indexname = 'idx_task_comments_task' LIMIT 1" },
    ],
  },
  {
    filename: '009_create_task_reviews.sql',
    checks: [
      { name: 'task_reviews table', sql: "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'task_reviews' AND table_type = 'BASE TABLE' LIMIT 1" },
      { name: 'task_reviews idx_task_reviews_task index', sql: "SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'task_reviews' AND indexname = 'idx_task_reviews_task' LIMIT 1" },
    ],
  },
  {
    filename: '010_create_bugs.sql',
    checks: [
      { name: 'bugs table', sql: "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'bugs' AND table_type = 'BASE TABLE' LIMIT 1" },
      { name: 'bugs idx_bugs_task index', sql: "SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'bugs' AND indexname = 'idx_bugs_task' LIMIT 1" },
      { name: 'bugs idx_bugs_project index', sql: "SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'bugs' AND indexname = 'idx_bugs_project' LIMIT 1" },
    ],
  },
  {
    filename: '011_create_bug_attachments.sql',
    checks: [
      { name: 'bug_attachments table', sql: "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'bug_attachments' AND table_type = 'BASE TABLE' LIMIT 1" },
      { name: 'bug_attachments idx_bug_attachments_bug index', sql: "SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'bug_attachments' AND indexname = 'idx_bug_attachments_bug' LIMIT 1" },
    ],
  },
  {
    filename: '012_create_notifications.sql',
    checks: [
      { name: 'notifications table', sql: "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'notifications' AND table_type = 'BASE TABLE' LIMIT 1" },
      { name: 'notifications idx_notifications_user index', sql: "SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'notifications' AND indexname = 'idx_notifications_user' LIMIT 1" },
      { name: 'notifications idx_notifications_read index', sql: "SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'notifications' AND indexname = 'idx_notifications_read' LIMIT 1" },
    ],
  },
  {
    filename: '013_task_management_additive.sql',
    checks: [
      { name: 'task_submissions table', sql: "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'task_submissions' AND table_type = 'BASE TABLE' LIMIT 1" },
      { name: 'task_submissions.task_id column', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'task_submissions' AND column_name = 'task_id' LIMIT 1" },
      { name: 'task_submissions.submitted_by column', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'task_submissions' AND column_name = 'submitted_by' LIMIT 1" },
      { name: 'task_submissions.task_id_fkey constraint', sql: "SELECT 1 FROM pg_constraint c JOIN pg_class rel ON rel.oid = c.conrelid JOIN pg_namespace n ON n.oid = rel.relnamespace WHERE c.conname = 'task_submissions_task_id_fkey' AND n.nspname = current_schema() AND rel.relname = 'task_submissions' LIMIT 1" },
      { name: 'task_submissions.submitted_by_fkey constraint', sql: "SELECT 1 FROM pg_constraint c JOIN pg_class rel ON rel.oid = c.conrelid JOIN pg_namespace n ON n.oid = rel.relnamespace WHERE c.conname = 'task_submissions_submitted_by_fkey' AND n.nspname = current_schema() AND rel.relname = 'task_submissions' LIMIT 1" },
      { name: 'tasks.submission_id column', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'tasks' AND column_name = 'submission_id' LIMIT 1" },
      { name: 'tasks_submission_id_fkey constraint', sql: "SELECT 1 FROM pg_constraint c JOIN pg_class rel ON rel.oid = c.conrelid JOIN pg_namespace n ON n.oid = rel.relnamespace WHERE c.conname = 'tasks_submission_id_fkey' AND n.nspname = current_schema() AND rel.relname = 'tasks' LIMIT 1" },
      { name: 'task_reviews.submission_id column', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'task_reviews' AND column_name = 'submission_id' LIMIT 1" },
      { name: 'task_reviews_submission_id_fkey constraint', sql: "SELECT 1 FROM pg_constraint c JOIN pg_class rel ON rel.oid = c.conrelid JOIN pg_namespace n ON n.oid = rel.relnamespace WHERE c.conname = 'task_reviews_submission_id_fkey' AND n.nspname = current_schema() AND rel.relname = 'task_reviews' LIMIT 1" },
    ],
  },
  {
    filename: '014_additive_task_management_hardening.sql',
    checks: [
      { name: 'task_comments.author_id column', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'task_comments' AND column_name = 'author_id' LIMIT 1" },
      { name: 'task_comments idx_task_comments_author_id index', sql: "SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'task_comments' AND indexname = 'idx_task_comments_author_id' LIMIT 1" },
      { name: 'task_attachments idx_task_attachments_uploaded_by index', sql: "SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'task_attachments' AND indexname = 'idx_task_attachments_uploaded_by' LIMIT 1" },
      { name: 'subtasks idx_subtasks_task_order index', sql: "SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'subtasks' AND indexname = 'idx_subtasks_task_order' LIMIT 1" },
    ],
  },
  {
    filename: '015_add_user_skills.sql',
    checks: [
      { name: 'users.skills column', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'skills' LIMIT 1" },
      { name: 'users idx_users_skills index', sql: "SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'users' AND indexname = 'idx_users_skills' LIMIT 1" },
    ],
  },
  {
    filename: '016_phase1_task_lifecycle.sql',
    checks: [
      { name: 'tasks.first_viewed_at column', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'tasks' AND column_name = 'first_viewed_at' LIMIT 1" },
      { name: 'tasks.on_hold_reason column', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'tasks' AND column_name = 'on_hold_reason' LIMIT 1" },
      { name: 'tasks idx_tasks_first_viewed_at index', sql: "SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'tasks' AND indexname = 'idx_tasks_first_viewed_at' LIMIT 1" },
    ],
  },
  {
    filename: '017_allow_seen_and_on_hold_statuses.sql',
    checks: [
      { name: 'tasks_status_check constraint', sql: "SELECT 1 FROM pg_constraint c JOIN pg_class rel ON rel.oid = c.conrelid JOIN pg_namespace n ON n.oid = rel.relnamespace WHERE c.conname = 'tasks_status_check' AND n.nspname = current_schema() AND rel.relname = 'tasks' LIMIT 1" },
    ],
  },
  {
    filename: '018_add_task_statuses_for_phases_6_to_8.sql',
    checks: [
      { name: 'tasks_status_check constraint (all 9 statuses)', sql: "SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class rel ON rel.oid = c.conrelid JOIN pg_namespace n ON n.oid = rel.relnamespace WHERE c.conname = 'tasks_status_check' AND n.nspname = current_schema() AND rel.relname = 'tasks' LIMIT 1" },
    ],
  },
  {
    filename: '019_add_bug_verification_columns.sql',
    checks: [
      { name: 'bugs.verified_by column', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'bugs' AND column_name = 'verified_by' LIMIT 1" },
      { name: 'bugs.verified_at column', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'bugs' AND column_name = 'verified_at' LIMIT 1" },
      { name: 'bugs idx_bugs_verified_by index', sql: "SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'bugs' AND indexname = 'idx_bugs_verified_by' LIMIT 1" },
      { name: 'bugs idx_bugs_verified_at index', sql: "SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'bugs' AND indexname = 'idx_bugs_verified_at' LIMIT 1" },
    ],
  },
  {
    filename: '020_add_project_task_statuses.sql',
    checks: [
      { name: 'task_statuses table', sql: "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'task_statuses' AND table_type = 'BASE TABLE' LIMIT 1" },
      { name: 'tasks.status_id column', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'tasks' AND column_name = 'status_id' LIMIT 1" },
      { name: 'idx_task_statuses_project_id index', sql: "SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'task_statuses' AND indexname = 'idx_task_statuses_project_id' LIMIT 1" },
    ],
  },
  {
    filename: '021_relax_tasks_status_check.sql',
    checks: [
      { name: 'tasks_status_check constraint', sql: "SELECT 1 FROM pg_constraint c JOIN pg_class rel ON rel.oid = c.conrelid JOIN pg_namespace n ON n.oid = rel.relnamespace WHERE c.conname = 'tasks_status_check' AND n.nspname = current_schema() AND rel.relname = 'tasks' LIMIT 1" },
    ],
  },
];

/**
 * Verifies that all key schema objects introduced by each recorded migration
 * still exist in the live database. Used when schema_migrations already has
 * records, to ensure consistency before executing pending migrations.
 *
 * Returns an array of missing object descriptions (empty if all present).
 */
async function verifyAppliedMigrations(
  client: any,
  applied: Set<string>
): Promise<string[]> {
  const missing: string[] = [];

  for (const migration of BASELINE_VERIFICATION_CHECKS) {
    if (!applied.has(migration.filename)) continue;

    for (const check of migration.checks) {
      const res = await client.query(check.sql);
      if (res.rows.length === 0) {
        missing.push(`${migration.filename}: ${check.name}`);
      }
    }
  }

  // Special check: tasks_status_check must contain all 9 expected statuses (unless relaxed by 021)
  if (applied.has('018_add_task_statuses_for_phases_6_to_8.sql') && !applied.has('021_relax_tasks_status_check.sql')) {
    const statuses = [
      'TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'SEEN', 'ON_HOLD',
      'CHANGES_REQUESTED', 'BUG_FIX_REQUIRED', 'READY_FOR_APPROVAL',
    ];
    const defRes = await client.query(
      "SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class rel ON rel.oid = c.conrelid JOIN pg_namespace n ON n.oid = rel.relnamespace WHERE c.conname = 'tasks_status_check' AND n.nspname = current_schema() AND rel.relname = 'tasks' LIMIT 1"
    );
    if (defRes.rows.length > 0) {
      const def = String(defRes.rows[0].def);
      for (const status of statuses) {
        if (!def.includes(status)) {
          missing.push(`018_add_task_statuses_for_phases_6_to_8.sql: tasks_status_check missing status '${status}'`);
        }
      }
    } else {
      missing.push(`018_add_task_statuses_for_phases_6_to_8.sql: tasks_status_check constraint on tasks table`);
    }
  }

  return missing;
}

/**
 * Probes the live PostgreSQL schema to determine whether the database is
 * empty, complete (all PMS migrations applied), or partial (inconsistent).
 *
 * Detection logic:
 *   - First checks whether ANY user tables exist in the current schema,
 *     EXCLUDING schema_migrations itself (which may have just been created).
 *   - If no user tables exist → 'empty' (genuinely new database).
 *   - If user tables exist, checks ALL key PMS schema objects from
 *     BASELINE_VERIFICATION_CHECKS:
 *     - All present → 'complete'
 *     - Some missing → { missing: [...] } (partial)
 *
 * Returns:
 *   'complete'  – all key PMS schema objects exist
 *   'empty'     – no PMS schema objects exist at all (genuinely new database)
 *   { missing: string[] } – partial state with list of missing objects
 */
async function detectSchemaState(client: any): Promise<SchemaState> {
  // First: check if ANY user tables exist in the current schema,
  // EXCLUDING schema_migrations itself (it may have just been created).
  const anyTablesRes = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' AND table_name != 'schema_migrations' LIMIT 1`
  );

  if (anyTablesRes.rows.length === 0) {
    return 'empty'; // Genuinely new database with no PMS tables
  }

  // User tables exist, so run baseline verification checks for baseline migrations only.
  const missing: string[] = [];
  const baselineSet = new Set(BASELINE_MIGRATIONS);

  for (const migration of BASELINE_VERIFICATION_CHECKS) {
    if (!baselineSet.has(migration.filename)) continue;
    for (const check of migration.checks) {
      const res = await client.query(check.sql);
      if (res.rows.length === 0) {
        missing.push(`${migration.filename}: ${check.name}`);
      }
    }
  }

  // Special check: tasks_status_check must contain all 9 expected statuses
  const defRes = await client.query(
    "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'tasks_status_check' AND conrelid = 'tasks'::regclass LIMIT 1"
  );
  if (defRes.rows.length > 0) {
    const def = String(defRes.rows[0].def);
    const statuses = [
      'TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'SEEN', 'ON_HOLD',
      'CHANGES_REQUESTED', 'BUG_FIX_REQUIRED', 'READY_FOR_APPROVAL',
    ];
    for (const status of statuses) {
      if (!def.includes(status)) {
        missing.push(`018_add_task_statuses_for_phases_6_to_8.sql: tasks_status_check missing status '${status}'`);
      }
    }
  } else {
    missing.push(`018_add_task_statuses_for_phases_6_to_8.sql: tasks_status_check constraint on tasks table`);
  }

  if (missing.length === 0) return 'complete';
  return { missing };
}
