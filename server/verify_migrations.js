require('dotenv').config();
const { Pool } = require('pg');

const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    };

const pool = new Pool(poolConfig);

const checks = [
  // 001: pgcrypto extension
  { name: '001_pgcrypto', sql: "SELECT extname FROM pg_extension WHERE extname = 'pgcrypto'" },
  // 002: projects columns
  { name: '002_projects_team_leader_id', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'projects' AND column_name = 'team_leader_id' LIMIT 1" },
  { name: '002_projects_name', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'projects' AND column_name = 'name' LIMIT 1" },
  // 003: tasks columns
  { name: '003_tasks_tl_recommendation', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'tasks' AND column_name = 'tl_recommendation' LIMIT 1" },
  { name: '003_tasks_review_feedback', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'tasks' AND column_name = 'review_feedback' LIMIT 1" },
  { name: '003_tasks_deadline', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'tasks' AND column_name = 'deadline' LIMIT 1" },
  // 004: project_team_members table
  { name: '004_project_team_members', sql: "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'project_team_members' AND table_type = 'BASE TABLE' LIMIT 1" },
  // 005: subtasks table
  { name: '005_subtasks', sql: "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'subtasks' AND table_type = 'BASE TABLE' LIMIT 1" },
  // 006: task_attachments table
  { name: '006_task_attachments', sql: "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'task_attachments' AND table_type = 'BASE TABLE' LIMIT 1" },
  // 007: demo_submissions table
  { name: '007_demo_submissions', sql: "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'demo_submissions' AND table_type = 'BASE TABLE' LIMIT 1" },
  // 008: task_comments table
  { name: '008_task_comments', sql: "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'task_comments' AND table_type = 'BASE TABLE' LIMIT 1" },
  // 009: task_reviews table
  { name: '009_task_reviews', sql: "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'task_reviews' AND table_type = 'BASE TABLE' LIMIT 1" },
  // 010: bugs table
  { name: '010_bugs', sql: "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'bugs' AND table_type = 'BASE TABLE' LIMIT 1" },
  // 011: bug_attachments table
  { name: '011_bug_attachments', sql: "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'bug_attachments' AND table_type = 'BASE TABLE' LIMIT 1" },
  // 012: notifications table
  { name: '012_notifications', sql: "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'notifications' AND table_type = 'BASE TABLE' LIMIT 1" },
  // 013: task_submissions table + columns + constraints
  { name: '013_task_submissions', sql: "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'task_submissions' AND table_type = 'BASE TABLE' LIMIT 1" },
  { name: '013_tasks_updated_at', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'tasks' AND column_name = 'updated_at' LIMIT 1" },
  { name: '013_tasks_deleted_at', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'tasks' AND column_name = 'deleted_at' LIMIT 1" },
  { name: '013_tasks_created_by_id', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'tasks' AND column_name = 'created_by_id' LIMIT 1" },
  { name: '013_tasks_submitted_at', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'tasks' AND column_name = 'submitted_at' LIMIT 1" },
  { name: '013_tasks_approved_at', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'tasks' AND column_name = 'approved_at' LIMIT 1" },
  { name: '013_tasks_approved_by_id', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'tasks' AND column_name = 'approved_by_id' LIMIT 1" },
  { name: '013_tasks_submission_id', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'tasks' AND column_name = 'submission_id' LIMIT 1" },
  { name: '013_task_reviews_submission_id', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'task_reviews' AND column_name = 'submission_id' LIMIT 1" },
  { name: '013_tasks_submission_id_fkey', sql: "SELECT 1 FROM pg_constraint c JOIN pg_class rel ON rel.oid = c.conrelid JOIN pg_namespace n ON n.oid = rel.relnamespace WHERE c.conname = 'tasks_submission_id_fkey' AND n.nspname = current_schema() AND rel.relname = 'tasks' LIMIT 1" },
  { name: '013_task_reviews_submission_id_fkey', sql: "SELECT 1 FROM pg_constraint c JOIN pg_class rel ON rel.oid = c.conrelid JOIN pg_namespace n ON n.oid = rel.relnamespace WHERE c.conname = 'task_reviews_submission_id_fkey' AND n.nspname = current_schema() AND rel.relname = 'task_reviews' LIMIT 1" },
  { name: '013_task_reviews_action_check', sql: "SELECT 1 FROM pg_constraint c JOIN pg_class rel ON rel.oid = c.conrelid JOIN pg_namespace n ON n.oid = rel.relnamespace WHERE c.conname = 'task_reviews_action_check' AND n.nspname = current_schema() AND rel.relname = 'task_reviews' LIMIT 1" },
  // 014: task_comments.author_id
  { name: '014_task_comments_author_id', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'task_comments' AND column_name = 'author_id' LIMIT 1" },
  // 015: users.skills
  { name: '015_users_skills', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'skills' LIMIT 1" },
  // 016: tasks.first_viewed_at, on_hold_reason
  { name: '016_tasks_first_viewed_at', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'tasks' AND column_name = 'first_viewed_at' LIMIT 1" },
  { name: '016_tasks_on_hold_reason', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'tasks' AND column_name = 'on_hold_reason' LIMIT 1" },
  // 017: tasks_status_check constraint with SEEN, ON_HOLD
  { name: '017_tasks_status_check', sql: "SELECT 1 FROM pg_constraint c JOIN pg_class rel ON rel.oid = c.conrelid JOIN pg_namespace n ON n.oid = rel.relnamespace WHERE c.conname = 'tasks_status_check' AND n.nspname = current_schema() AND rel.relname = 'tasks' LIMIT 1" },
  // 018: tasks_status_check constraint with all statuses
  { name: '018_tasks_status_check', sql: "SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class rel ON rel.oid = c.conrelid JOIN pg_namespace n ON n.oid = rel.relnamespace WHERE c.conname = 'tasks_status_check' AND n.nspname = current_schema() AND rel.relname = 'tasks' LIMIT 1" },
  // 019: bugs.verified_by, bugs.verified_at
  { name: '019_bugs_verified_by', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'bugs' AND column_name = 'verified_by' LIMIT 1" },
  { name: '019_bugs_verified_at', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'bugs' AND column_name = 'verified_at' LIMIT 1" },
  // 020: task_statuses table and tasks.status_id
  { name: '020_task_statuses_table', sql: "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'task_statuses' AND table_type = 'BASE TABLE' LIMIT 1" },
  { name: '020_tasks_status_id', sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'tasks' AND column_name = 'status_id' LIMIT 1" },
  // 021: tasks_status_check relaxed
  { name: '021_tasks_status_check_relaxed', sql: "SELECT 1 FROM pg_constraint WHERE conrelid = 'tasks'::regclass AND conname = 'tasks_status_check' LIMIT 1" },
];

(async () => {
  const client = await pool.connect();
  try {
    let allPass = true;
    for (const check of checks) {
      const res = await client.query(check.sql);
      const pass = res.rows.length > 0;
      if (!pass) allPass = false;
      // For 018, show the actual constraint definition
      let detail = '';
      if (check.name === '018_tasks_status_check' && res.rows.length > 0) {
        detail = ` -> ${res.rows[0].def}`;
      }
      console.log(`${pass ? 'PASS' : 'FAIL'} | ${check.name}${detail}`);
    }
    console.log(`\n${allPass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}`);
  } catch (e) {
    console.error('ERR', e.message);
  } finally {
    client.release();
    process.exit(0);
  }
})();
