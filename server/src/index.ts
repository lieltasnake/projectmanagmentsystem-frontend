import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { checkDbConnection, runSafeMigrations, pool } from './db';
import { initializeHeartbeatWorker } from './workers/heartbeat-singleton';
import authRouter from './routes/auth';
import usersRouter from './routes/users';
import projectsRouter from './routes/projects';
import tasksRouter from './routes/tasks';
import githubWebhookRouter from './routes/github-webhook';
import githubInstallationRouter from './routes/github-installation';
import githubWebhookRetryRouter from './routes/github-webhook-retry';
import githubRepositoriesRouter from './routes/github-repositories';
import githubBranchRouter from './routes/github-branches';
import githubPullRequestRouter from './routes/github-pull-requests';
import githubCommitsRouter from './routes/github-commits';

const app = express();
const PORT = Number(process.env.PORT) || 5000;

// Middleware
app.use(cors());
// NOTE: express.raw() is scoped to /api/github/webhooks so that GitHub webhook
// middleware can capture the raw body for HMAC-SHA256 signature verification.
// All other JSON routes (including /api/auth/login) are handled by express.json().
// Per Phase 1 Decision 5.
app.use(
  '/api/github/webhooks',
  express.raw({
    type: 'application/json',
    verify: (req, _res, buf) => {
      // Store raw body on request for webhook signature verification
      (req as any).rawBody = buf;
    },
  })
);
app.use(express.json());

// Preserved /api/health endpoint with safe database connectivity check
app.get('/api/health', async (_req: Request, res: Response) => {
  const dbStatus = await checkDbConnection();

  if (!dbStatus.connected) {
    return res.status(503).json({
      success: false,
      message: 'PMS backend is running, but database connection failed.',
      database: 'disconnected',
    });
  }

  return res.status(200).json({
    success: true,
    message: 'PMS backend is running!',
    database: 'connected',
    timestamp: dbStatus.timestamp,
  });
});

// Authentication routes
app.use('/api/auth', authRouter);

// User Management routes
app.use('/api/users', usersRouter);

// Project routes
app.use('/api/projects', projectsRouter);

// Task routes
app.use('/api/tasks', tasksRouter);

// GitHub Integration routes (Stage 1)
app.use('/api/github/webhooks', githubWebhookRouter);
app.use('/api/github/installation', githubInstallationRouter);
app.use('/api/github/webhook-retry', githubWebhookRetryRouter);
app.use('/api/github/installation', githubRepositoriesRouter);
app.use('/api/github/installation', githubBranchRouter);
app.use('/api/github/installation', githubPullRequestRouter);
app.use('/api/github/installation', githubCommitsRouter);

// Static file serving for extracted ZIP demo previews
const DEMO_UPLOAD_DIR = path.join(__dirname, 'uploads', 'demos');
app.use('/api/uploads/demos', express.static(DEMO_UPLOAD_DIR));

// 404 handler for undefined routes
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found.',
  });
});

// Global error handler - never exposes stack traces or sensitive credentials
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled server error:', err.message);
  res.status(500).json({
    success: false,
    error: 'Internal server error.',
  });
});

// Initialize database migration check and start listening
async function startServer() {
  await runSafeMigrations();

  // Initialize GitHub heartbeat worker (tables must be pre-initialized)
  const heartbeatWorker = initializeHeartbeatWorker();
  await heartbeatWorker.start();
  console.log('GitHub heartbeat worker started.');

  app.listen(PORT, () => {
    console.log(`🚀 PMS backend running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});

export default app;