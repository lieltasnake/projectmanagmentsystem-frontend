import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { checkDbConnection, runSafeMigrations } from './db';
import authRouter from './routes/auth';
import usersRouter from './routes/users';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;

// Middleware
app.use(cors());
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

  app.listen(PORT, () => {
    console.log(`🚀 PMS backend running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});

export default app;
