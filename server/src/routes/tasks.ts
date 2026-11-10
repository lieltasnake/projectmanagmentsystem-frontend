import { Router, Request, Response, NextFunction } from 'express';
import { pool, taskStatusesTableExists } from '../db';
import { authenticateToken, requirePM, requireRoles, AuthenticatedRequest } from '../middleware/auth';
import { checkProjectAccess } from './projects';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

const router = Router();

// Multer storage for ZIP demo uploads
const DEMO_UPLOAD_ROOT = path.join(__dirname, '..', 'uploads', 'demos');
fs.mkdirSync(DEMO_UPLOAD_ROOT, { recursive: true });

const uploadZip = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, DEMO_UPLOAD_ROOT),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.zip') {
      return cb(new Error('Only ZIP archives are allowed.'));
    }
    cb(null, true);
  },
});

/**
 * POST /api/tasks/:id/demo/upload
 * Upload a ZIP website demo for the assigned TM's submission.
 */
router.post('/:id/demo/upload', authenticateToken, uploadZip.single('file'), async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });

    const taskId = Number(req.params.id);
    if (!taskId || isNaN(taskId)) return res.status(400).json({ success: false, error: 'Invalid task ID.' });

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No ZIP file provided.' });
    }

    const taskRes = await client.query(
      'SELECT t.*, p.deleted_at AS project_deleted FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1',
      [taskId]
    );
    if (taskRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found.' });
    const task = taskRes.rows[0];
    if (task.deleted_at) return res.status(404).json({ success: false, error: 'Task not found.' });
    if (task.project_deleted) return res.status(404).json({ success: false, error: 'Project not found.' });
    if (task.assigned_to_id !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden: Only the assigned user can upload a demo.' });
    }
    if (userRole !== 'TM') {
      return res.status(403).json({ success: false, error: 'Forbidden: Only the assigned Team Member can upload a demo.' });
    }

    const hasAccess = await checkProjectAccess(client, task.project_id, userId, userRole);
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Forbidden: No access to this project.' });

    // Determine next submission version for this task
    const vRes = await client.query('SELECT COALESCE(MAX(version), 0) + 1 AS nextv FROM task_submissions WHERE task_id = $1', [taskId]);
    const nextVersion = vRes.rows[0].nextv;

    const zipPath = req.file.path;
    let extractDir: string;
    try {
      extractDir = path.join(DEMO_UPLOAD_ROOT, `task_${taskId}`, `submission_${nextVersion}`);
      fs.mkdirSync(extractDir, { recursive: true });

      const zip = new AdmZip(zipPath);
      zip.extractAllTo(extractDir, true);
    } catch (unzipErr: any) {
      // Clean up uploaded zip on failure
      try { fs.unlinkSync(zipPath); } catch { /* ignore */ }
      return res.status(400).json({ success: false, error: 'Failed to extract ZIP archive. Invalid or corrupted ZIP.' });
    }

    // Find index.html entry point
    const indexPath = path.join(extractDir, 'index.html');
    if (!fs.existsSync(indexPath)) {
      // Try common subdirectory patterns
      const entries = fs.readdirSync(extractDir);
      let foundIndex: string | null = null;
      for (const entry of entries) {
        const fullPath = path.join(extractDir, entry);
        if (fs.statSync(fullPath).isDirectory() && fs.existsSync(path.join(fullPath, 'index.html'))) {
          foundIndex = path.join(fullPath, 'index.html');
          break;
        }
      }
      if (!foundIndex) {
        return res.status(400).json({ success: false, error: 'ZIP archive does not contain an index.html entry point.' });
      }
    }

    const relativeDemoPath = path.relative(DEMO_UPLOAD_ROOT, indexPath).split(path.sep).join('/');
    const demoUrl = `/api/uploads/demos/${relativeDemoPath}`;

    // Insert submission record
    const subRes = await client.query(
      'INSERT INTO task_submissions (task_id, submitted_by, submitted_role, demo_url, description, version) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, version',
      [taskId, userId, userRole, demoUrl, null, nextVersion]
    );
    const submission = subRes.rows[0];

    // Update task status to Under Review and link submission
    await client.query(
      'UPDATE tasks SET status = $1, submitted_at = CURRENT_TIMESTAMP, submission_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      ['REVIEW', submission.id, taskId]
    );

    // Clean up uploaded zip file
    try { fs.unlinkSync(zipPath); } catch { /* ignore */ }

    return res.status(201).json({
      success: true,
      message: 'ZIP demo uploaded and extracted successfully.',
      submission: { id: String(submission.id), version: submission.version },
      demoUrl,
      status: 'Under Review',
    });
  } catch (err: any) {
    console.error('POST /api/tasks/:id/demo/upload error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to upload ZIP demo.' });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/tasks/:id
 * Update task details (title, description, priority, deadline). PM and authorized TL only.
 * Status cannot be changed here.
 */
router.patch('/:id', authenticateToken, requireRoles('PM', 'TL'), async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });
    if (userRole !== 'PM' && userRole !== 'TL') {
      return res.status(403).json({ success: false, error: 'Forbidden: Only PM and TL can update tasks.' });
    }

    const taskId = Number(req.params.id);
    if (!taskId || isNaN(taskId)) return res.status(400).json({ success: false, error: 'Invalid task ID.' });

    const taskRes = await client.query(
      'SELECT t.*, p.manager_id, p.deleted_at AS project_deleted, p.project_key FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1',
      [taskId]
    );
    if (taskRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found.' });
    const task = taskRes.rows[0];
    if (task.deleted_at) return res.status(404).json({ success: false, error: 'Task not found.' });
    if (task.project_deleted) return res.status(404).json({ success: false, error: 'Project not found.' });

    const hasAccess = await checkProjectAccess(client, task.project_id, userId, userRole);
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Forbidden: No access to this project.' });

    const { title, description, priority, deadline } = req.body || {};
    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ success: false, error: 'Task title cannot be empty.' });
      }
      updates.push('title = $' + idx++);
      params.push(title.trim());
    }
    if (description !== undefined) {
      updates.push('description = $' + idx++);
      params.push(description === null ? null : String(description));
    }
    if (priority !== undefined) {
      const pmap: Record<string, string> = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', URGENT: 'URGENT', Low: 'LOW', Medium: 'MEDIUM', High: 'HIGH', Urgent: 'URGENT' };
      const dbP = pmap[String(priority).trim()] || pmap[String(priority).trim().toUpperCase()];
      if (!dbP || !['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(dbP)) {
        return res.status(400).json({ success: false, error: 'Invalid priority value.' });
      }
      updates.push('priority = $' + idx++);
      params.push(dbP);
    }
    if (deadline !== undefined) {
      const dl = deadline === null || String(deadline).trim() === '' ? null : String(deadline).trim();
      updates.push('deadline = $' + idx++);
      params.push(dl);
      updates.push('due_date = $' + idx++);
      params.push(dl);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update.' });
    }
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(taskId);
    const q = 'UPDATE tasks SET ' + updates.join(', ') + ' WHERE id = $' + idx + ' RETURNING id, project_id, title, description, status, priority, assigned_to_id, deadline, due_date, created_at, updated_at';
    const result = await client.query(q, params);
    const r = result.rows[0];
    const statusMap: Record<string, string> = { TODO: 'Not Started', IN_PROGRESS: 'In Progress', REVIEW: 'Under Review', DONE: 'Completed' };
    const prioMap: Record<string, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', URGENT: 'Urgent' };
    return res.status(200).json({
      success: true,
      message: 'Task updated successfully.',
      task: {
        id: String(r.id),
        projectId: String(r.project_id),
        title: r.title,
        description: r.description || '',
        status: statusMap[String(r.status || '').toUpperCase()] || 'Not Started',
        priority: prioMap[String(r.priority || '').toUpperCase()] || 'Medium',
        assignedToId: r.assigned_to_id ? String(r.assigned_to_id) : null,
        deadline: r.deadline ? String(r.deadline).slice(0, 10) : (r.due_date ? String(r.due_date).slice(0, 10) : null),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        taskNumber: r.task_number || null,
        taskKey: r.task_number ? `${r.project_key}-${r.task_number}` : null,
      },
    });
  } catch (err: any) {
    console.error('PATCH /api/tasks/:id error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to update task.' });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/tasks/:id
 * Soft-delete a task. Only owning PM.
 */
router.delete('/:id', authenticateToken, requireRoles('PM'), async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });
    if (userRole !== 'PM') {
      return res.status(403).json({ success: false, error: 'Forbidden: Only PM can delete tasks.' });
    }
    const taskId = Number(req.params.id);
    if (!taskId || isNaN(taskId)) return res.status(400).json({ success: false, error: 'Invalid task ID.' });

    const taskRes = await client.query(
      'SELECT t.id, t.project_id, p.manager_id, t.deleted_at FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1',
      [taskId]
    );
    if (taskRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found.' });
    const task = taskRes.rows[0];
    if (task.deleted_at) return res.status(404).json({ success: false, error: 'Task not found.' });
    if (task.manager_id !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden: Only the project owner can delete this task.' });
    }

    await client.query('UPDATE tasks SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [taskId]);
    return res.status(200).json({ success: true, message: 'Task deleted successfully.' });
  } catch (err: any) {
    console.error('DELETE /api/tasks/:id error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to delete task.' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/tasks/:id/restore
 * Restore a soft-deleted task. Only owning PM.
 */
router.post('/:id/restore', authenticateToken, requireRoles('PM'), async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });
    if (userRole !== 'PM') {
      return res.status(403).json({ success: false, error: 'Forbidden: Only PM can restore tasks.' });
    }
    const taskId = Number(req.params.id);
    if (!taskId || isNaN(taskId)) return res.status(400).json({ success: false, error: 'Invalid task ID.' });

    const taskRes = await client.query(
      'SELECT t.id, t.project_id, p.manager_id, t.deleted_at FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1',
      [taskId]
    );
    if (taskRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found.' });
    const task = taskRes.rows[0];
    if (!task.deleted_at) return res.status(400).json({ success: false, error: 'Task is not deleted.' });
    if (task.manager_id !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden: Only the project owner can restore this task.' });
    }

    await client.query('UPDATE tasks SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [taskId]);
    return res.status(200).json({ success: true, message: 'Task restored successfully.' });
  } catch (err: any) {
    console.error('POST /api/tasks/:id/restore error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to restore task.' });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/tasks/:id/assign
 * Assign or reassign a task. PM and authorized TL only.
 */
router.patch('/:id/assign', authenticateToken, requireRoles('PM', 'TL'), async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });
    if (userRole !== 'PM' && userRole !== 'TL') {
      return res.status(403).json({ success: false, error: 'Forbidden: Only PM and TL can assign tasks.' });
    }

    const taskId = Number(req.params.id);
    if (!taskId || isNaN(taskId)) return res.status(400).json({ success: false, error: 'Invalid task ID.' });

    const taskRes = await client.query(
      'SELECT t.id, t.project_id, p.manager_id, p.deleted_at AS project_deleted, t.deleted_at FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1',
      [taskId]
    );
    if (taskRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found.' });
    const task = taskRes.rows[0];
    if (task.deleted_at) return res.status(404).json({ success: false, error: 'Task not found.' });
    if (task.project_deleted) return res.status(404).json({ success: false, error: 'Project not found.' });

    const hasAccess = await checkProjectAccess(client, task.project_id, userId, userRole);
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Forbidden: No access to this project.' });

    const { assignedToId } = req.body || {};
    let assignedUserId: number | null = null;
    if (assignedToId !== undefined && assignedToId !== null && String(assignedToId).trim() !== '') {
      const num = Number(assignedToId);
      if (isNaN(num) || num <= 0) return res.status(400).json({ success: false, error: 'Invalid assigned user ID.' });
      const userRes = await client.query('SELECT id, is_active, role FROM users WHERE id = $1', [num]);
      if (userRes.rows.length === 0) return res.status(400).json({ success: false, error: 'Assigned user does not exist.' });
      if (!userRes.rows[0].is_active) return res.status(400).json({ success: false, error: 'Assigned user is not active.' });
      const role = String(userRes.rows[0].role).toUpperCase();
      if (!['TM', 'TL', 'TESTER', 'PM'].includes(role)) return res.status(400).json({ success: false, error: 'Invalid role for task assignment.' });
      const memRes = await client.query(
        'SELECT 1 FROM projects p LEFT JOIN project_team_members ptm ON ptm.project_id = p.id AND ptm.user_id = $2 WHERE p.id = $1 AND p.deleted_at IS NULL AND (p.manager_id = $2 OR ptm.user_id IS NOT NULL)',
        [task.project_id, num]
      );
      if (memRes.rows.length === 0) return res.status(400).json({ success: false, error: 'Assigned user is not an eligible project team member.' });
      assignedUserId = num;
    }

    await client.query('UPDATE tasks SET assigned_to_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [assignedUserId, taskId]);
    return res.status(200).json({ success: true, message: 'Task assignment updated successfully.', assignedToId: assignedUserId ? String(assignedUserId) : null });
  } catch (err: any) {
    console.error('PATCH /api/tasks/:id/assign error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to assign task.' });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/tasks/:id/start
 * Assigned TM starts work -> IN_PROGRESS
 */
router.patch('/:id/start', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });

    const taskId = Number(req.params.id);
    if (!taskId || isNaN(taskId)) return res.status(400).json({ success: false, error: 'Invalid task ID.' });

    const taskRes = await client.query(
      'SELECT t.*, p.deleted_at AS project_deleted FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1',
      [taskId]
    );
    if (taskRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found.' });
    const task = taskRes.rows[0];
    if (task.deleted_at) return res.status(404).json({ success: false, error: 'Task not found.' });
    if (task.project_deleted) return res.status(404).json({ success: false, error: 'Project not found.' });

    if (task.assigned_to_id !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden: Only the assigned user can start this task.' });
    }
    if (userRole !== 'TM') {
      return res.status(403).json({ success: false, error: 'Forbidden: Only the assigned Team Member can start this task.' });
    }
    if (task.status !== 'TODO' && task.status !== 'SEEN') {
      return res.status(400).json({ success: false, error: 'Task can only be started from Not Started or Seen status.' });
    }

    const hasAccess = await checkProjectAccess(client, task.project_id, userId, userRole);
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Forbidden: No access to this project.' });

    const statusesTableExistsLocal = await taskStatusesTableExists(client);
    if (statusesTableExistsLocal) {
      await client.query(
        'UPDATE tasks SET status = $1, status_id = (SELECT id FROM task_statuses WHERE project_id = tasks.project_id AND name = $2 LIMIT 1), updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        ['IN_PROGRESS', 'In Progress', taskId]
      );
    } else {
      await client.query(
        'UPDATE tasks SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['IN_PROGRESS', taskId]
      );
    }
    return res.status(200).json({ success: true, message: 'Task started.', status: 'In Progress' });
  } catch (err: any) {
    console.error('PATCH /api/tasks/:id/start error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to start task.' });
  } finally {
    client.release();
  }
});

router.patch('/:id/on-hold', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });

    const taskId = Number(req.params.id);
    if (!taskId || isNaN(taskId)) return res.status(400).json({ success: false, error: 'Invalid task ID.' });

    const reason = req.body?.reason;
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ success: false, error: 'On Hold reason is required.' });
    }

    const taskRes = await client.query('SELECT t.*, p.deleted_at AS project_deleted FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1', [taskId]);
    if (taskRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found.' });
    const task = taskRes.rows[0];
    if (task.deleted_at) return res.status(404).json({ success: false, error: 'Task not found.' });
    if (task.project_deleted) return res.status(404).json({ success: false, error: 'Project not found.' });
    if (task.assigned_to_id !== userId) return res.status(403).json({ success: false, error: 'Forbidden: Only the assigned user can put this task on hold.' });
    if (userRole !== 'TM') return res.status(403).json({ success: false, error: 'Forbidden.' });
    if (task.status !== 'IN_PROGRESS') return res.status(400).json({ success: false, error: 'Task can only be put on hold from In Progress.' });

    const hasAccess = await checkProjectAccess(client, task.project_id, userId, userRole);
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Forbidden: No access to this project.' });

    const statusesTableExistsLocal = await taskStatusesTableExists(client);
    if (statusesTableExistsLocal) {
      await client.query(
        'UPDATE tasks SET status=$1, status_id = (SELECT id FROM task_statuses WHERE project_id = tasks.project_id AND name = $2 LIMIT 1), on_hold_reason=$3, updated_at=NOW() WHERE id=$4',
        ['ON_HOLD', 'On Hold', String(reason).trim(), taskId]
      );
    } else {
      await client.query(
        'UPDATE tasks SET status=$1, on_hold_reason=$2, updated_at=NOW() WHERE id=$3',
        ['ON_HOLD', String(reason).trim(), taskId]
      );
    }
    return res.status(200).json({ success: true, message: 'Task put on hold.', status: 'On Hold' });
  } catch (err: any) {
    console.error('PATCH /api/tasks/:id/on-hold error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to put task on hold.' });
  } finally {
    client.release();
  }
});

router.patch('/:id/resume', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });

    const taskId = Number(req.params.id);
    if (!taskId || isNaN(taskId)) return res.status(400).json({ success: false, error: 'Invalid task ID.' });

    const taskRes = await client.query('SELECT t.*, p.deleted_at AS project_deleted FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1', [taskId]);
    if (taskRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found.' });
    const task = taskRes.rows[0];
    if (task.deleted_at) return res.status(404).json({ success: false, error: 'Task not found.' });
    if (task.project_deleted) return res.status(404).json({ success: false, error: 'Project not found.' });
    if (task.assigned_to_id !== userId) return res.status(403).json({ success: false, error: 'Forbidden.' });
    if (userRole !== 'TM') return res.status(403).json({ success: false, error: 'Forbidden.' });
    if (task.status !== 'ON_HOLD') return res.status(400).json({ success: false, error: 'Task can only be resumed from On Hold.' });

    const hasAccess = await checkProjectAccess(client, task.project_id, userId, userRole);
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Forbidden: No access to this project.' });

    const statusesTableExistsLocal = await taskStatusesTableExists(client);
    if (statusesTableExistsLocal) {
      await client.query(
        'UPDATE tasks SET status=$1, status_id = (SELECT id FROM task_statuses WHERE project_id = tasks.project_id AND name = $2 LIMIT 1), on_hold_reason=NULL, updated_at=NOW() WHERE id=$3',
        ['IN_PROGRESS', 'In Progress', taskId]
      );
    } else {
      await client.query(
        'UPDATE tasks SET status=$1, on_hold_reason=NULL, updated_at=NOW() WHERE id=$2',
        ['IN_PROGRESS', taskId]
      );
    }
    return res.status(200).json({ success: true, message: 'Task resumed.', status: 'In Progress' });
  } catch (err: any) {
    console.error('PATCH /api/tasks/:id/resume error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to resume task.' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/tasks/:id/submit
 * TM submits work for review -> REVIEW, creates submission version
 */
router.post('/:id/submit', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });

    const taskId = Number(req.params.id);
    if (!taskId || isNaN(taskId)) return res.status(400).json({ success: false, error: 'Invalid task ID.' });

    const taskRes = await client.query(
      'SELECT t.*, p.deleted_at AS project_deleted FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1',
      [taskId]
    );
    if (taskRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found.' });
    const task = taskRes.rows[0];
    if (task.deleted_at) return res.status(404).json({ success: false, error: 'Task not found.' });
    if (task.project_deleted) return res.status(404).json({ success: false, error: 'Project not found.' });

    if (task.assigned_to_id !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden: Only the assigned user can submit this task.' });
    }
    if (userRole !== 'TM') {
      return res.status(403).json({ success: false, error: 'Forbidden: Only the assigned Team Member can submit this task.' });
    }
    if (task.status !== 'IN_PROGRESS') {
      return res.status(400).json({ success: false, error: 'Task must be In Progress before submitting.' });
    }

    const hasAccess = await checkProjectAccess(client, task.project_id, userId, userRole);
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Forbidden: No access to this project.' });

    const { demoUrl, description } = req.body || {};

    await client.query('BEGIN');
    // determine next version
    const vRes = await client.query('SELECT COALESCE(MAX(version), 0) + 1 AS nextv FROM task_submissions WHERE task_id = $1', [taskId]);
    const nextVersion = vRes.rows[0].nextv;

    const subRes = await client.query(
      'INSERT INTO task_submissions (task_id, submitted_by, submitted_role, demo_url, description, version) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, version',
      [taskId, userId, userRole, demoUrl || null, description || null, nextVersion]
    );
    const submission = subRes.rows[0];

    // review history
    await client.query(
      'INSERT INTO task_reviews (task_id, author_id, author_name, author_role, action, comment, submission_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [taskId, userId, req.user?.name || '', userRole, 'submit', description || null, submission.id]
    );

    // update task
    const statusesTableExistsLocal = await taskStatusesTableExists(client);
    if (statusesTableExistsLocal) {
      await client.query(
        'UPDATE tasks SET status = $1, status_id = (SELECT id FROM task_statuses WHERE project_id = tasks.project_id AND name = $2 LIMIT 1), submitted_at = CURRENT_TIMESTAMP, submission_id = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4',
        ['REVIEW', 'Under Review', submission.id, taskId]
      );
    } else {
      await client.query(
        'UPDATE tasks SET status = $1, submitted_at = CURRENT_TIMESTAMP, submission_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        ['REVIEW', submission.id, taskId]
      );
    }

    await client.query('COMMIT');
    return res.status(201).json({
      success: true,
      message: 'Work submitted for review.',
      submission: { id: String(submission.id), version: submission.version },
      status: 'Under Review',
    });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /api/tasks/:id/submit error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to submit work.' });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/tasks/:id/request-corrections
 * TL or PM requests corrections -> IN_PROGRESS
 */
router.patch('/:id/request-corrections', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });
    if (userRole !== 'PM' && userRole !== 'TL') {
      return res.status(403).json({ success: false, error: 'Forbidden.' });
    }

    const taskId = Number(req.params.id);
    if (!taskId || isNaN(taskId)) return res.status(400).json({ success: false, error: 'Invalid task ID.' });

    const taskRes = await client.query(
      'SELECT t.*, p.deleted_at AS project_deleted, p.manager_id FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1',
      [taskId]
    );
    if (taskRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found.' });
    const task = taskRes.rows[0];
    if (task.deleted_at) return res.status(404).json({ success: false, error: 'Task not found.' });
    if (task.project_deleted) return res.status(404).json({ success: false, error: 'Project not found.' });

    const hasAccess = await checkProjectAccess(client, task.project_id, userId, userRole);
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Forbidden: No access to this project.' });

    if (task.status !== 'REVIEW') {
      return res.status(400).json({ success: false, error: 'Task must be Under Review to request corrections.' });
    }

    const { feedback } = req.body || {};
    if (!feedback || !String(feedback).trim()) {
      return res.status(400).json({ success: false, error: 'Feedback is required.' });
    }

    await client.query('BEGIN');
    await client.query(
      'INSERT INTO task_reviews (task_id, author_id, author_name, author_role, action, comment, submission_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [taskId, userId, req.user?.name || '', userRole, 'request_corrections', String(feedback).trim(), task.submission_id]
    );
    const statusesTableExistsLocal = await taskStatusesTableExists(client);
    if (statusesTableExistsLocal) {
      await client.query(
        'UPDATE tasks SET status = $1, status_id = (SELECT id FROM task_statuses WHERE project_id = tasks.project_id AND name = $2 LIMIT 1), tl_recommendation = $3, review_feedback = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5',
        ['CHANGES_REQUESTED', 'Changes Requested', 'corrections_requested', String(feedback).trim(), taskId]
      );
    } else {
      await client.query(
        'UPDATE tasks SET status = $1, tl_recommendation = $2, review_feedback = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4',
        ['CHANGES_REQUESTED', 'corrections_requested', String(feedback).trim(), taskId]
      );
    }

    // Create notifications for assigned TM and TLs
    const assignedTmId = task.assigned_to_id;
    if (assignedTmId && assignedTmId !== userId) {
      await createNotification(client, assignedTmId, 'Corrections Requested', `Team Leader requested corrections on task #${taskId}. ${String(feedback).trim()}`, 'warning', taskId, task.project_id);
    }
    const tlRes = await client.query(`SELECT u.id FROM users u WHERE u.role = 'TL' AND u.is_active = TRUE`);
    for (const row of tlRes.rows) {
      await createNotification(client, row.id, 'Corrections Requested', `Corrections requested on task #${taskId}.`, 'info', taskId, task.project_id);
    }

    await client.query('COMMIT');
    return res.status(200).json({ success: true, message: 'Corrections requested.', status: 'Changes Requested' });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('PATCH /api/tasks/:id/request-corrections error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to request corrections.' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/tasks/:id/resubmit
 * TM resubmits revised work -> REVIEW, new submission version
 */
router.post('/:id/resubmit', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });

    const taskId = Number(req.params.id);
    if (!taskId || isNaN(taskId)) return res.status(400).json({ success: false, error: 'Invalid task ID.' });

    const taskRes = await client.query(
      'SELECT t.*, p.deleted_at AS project_deleted FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1',
      [taskId]
    );
    if (taskRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found.' });
    const task = taskRes.rows[0];
    if (task.deleted_at) return res.status(404).json({ success: false, error: 'Task not found.' });
    if (task.project_deleted) return res.status(404).json({ success: false, error: 'Project not found.' });

    if (task.assigned_to_id !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden: Only the assigned user can resubmit.' });
    }
    if (userRole !== 'TM') {
      return res.status(403).json({ success: false, error: 'Forbidden: Only the assigned Team Member can resubmit.' });
    }
    if (task.status !== 'IN_PROGRESS' && task.status !== 'CHANGES_REQUESTED' && task.status !== 'BUG_FIX_REQUIRED') {
      return res.status(400).json({ success: false, error: 'Task must be In Progress, Changes Requested, or Bug Fix Required to resubmit.' });
    }

    const hasAccess = await checkProjectAccess(client, task.project_id, userId, userRole);
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Forbidden: No access to this project.' });

    const { demoUrl, description } = req.body || {};

    await client.query('BEGIN');
    const vRes = await client.query('SELECT COALESCE(MAX(version), 0) + 1 AS nextv FROM task_submissions WHERE task_id = $1', [taskId]);
    const nextVersion = vRes.rows[0].nextv;

    const subRes = await client.query(
      'INSERT INTO task_submissions (task_id, submitted_by, submitted_role, demo_url, description, version) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, version',
      [taskId, userId, userRole, demoUrl || null, description || null, nextVersion]
    );
    const submission = subRes.rows[0];

    await client.query(
      'INSERT INTO task_reviews (task_id, author_id, author_name, author_role, action, comment, submission_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [taskId, userId, req.user?.name || '', userRole, 'resubmit', description || null, submission.id]
    );

    const statusesTableExistsLocal = await taskStatusesTableExists(client);
    if (statusesTableExistsLocal) {
      await client.query(
        'UPDATE tasks SET status = $1, status_id = (SELECT id FROM task_statuses WHERE project_id = tasks.project_id AND name = $2 LIMIT 1), submitted_at = CURRENT_TIMESTAMP, submission_id = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4',
        ['REVIEW', 'Under Review', submission.id, taskId]
      );
    } else {
      await client.query(
        'UPDATE tasks SET status = $1, submitted_at = CURRENT_TIMESTAMP, submission_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        ['REVIEW', submission.id, taskId]
      );
    }

    await client.query('COMMIT');
    return res.status(201).json({
      success: true,
      message: 'Work resubmitted for review.',
      submission: { id: String(submission.id), version: submission.version },
      status: 'Under Review',
    });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /api/tasks/:id/resubmit error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to resubmit work.' });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/tasks/:id/recommend
 * TL recommends final approval (on current submission)
 */
router.patch('/:id/recommend', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });
    if (userRole !== 'TL') {
      return res.status(403).json({ success: false, error: 'Forbidden.' });
    }

    const taskId = Number(req.params.id);
    if (!taskId || isNaN(taskId)) return res.status(400).json({ success: false, error: 'Invalid task ID.' });

    const taskRes = await client.query(
      'SELECT t.*, p.deleted_at AS project_deleted, p.manager_id FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1',
      [taskId]
    );
    if (taskRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found.' });
    const task = taskRes.rows[0];
    if (task.deleted_at) return res.status(404).json({ success: false, error: 'Task not found.' });
    if (task.project_deleted) return res.status(404).json({ success: false, error: 'Project not found.' });

    const hasAccess = await checkProjectAccess(client, task.project_id, userId, userRole);
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Forbidden: No access to this project.' });

    if (task.status !== 'REVIEW') {
      return res.status(400).json({ success: false, error: 'Task must be Under Review to recommend.' });
    }
    if (task.tl_recommendation === 'recommended') {
      return res.status(400).json({ success: false, error: 'Task already recommended for approval.' });
    }
    if (!task.submission_id) {
      return res.status(400).json({ success: false, error: 'No submission to recommend.' });
    }

    const { comment } = req.body || {};
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO task_reviews (task_id, author_id, author_name, author_role, action, comment, submission_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [taskId, userId, req.user?.name || '', userRole, 'recommend_approval', comment || null, task.submission_id]
    );
    const statusesTableExistsLocal = await taskStatusesTableExists(client);
    if (statusesTableExistsLocal) {
      await client.query(
        'UPDATE tasks SET tl_recommendation = $1, status_id = (SELECT id FROM task_statuses WHERE project_id = tasks.project_id AND name = $2 LIMIT 1), updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        ['recommended', 'Under Review', taskId]
      );
    } else {
      await client.query(
        'UPDATE tasks SET tl_recommendation = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['recommended', taskId]
      );
    }
    await client.query('COMMIT');
    return res.status(200).json({ success: true, message: 'Approval recommended.', status: 'Under Review' });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('PATCH /api/tasks/:id/recommend error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to recommend.' });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/tasks/:id/approve
 * PM final approval -> DONE. Requires TL recommendation on current submission. Transaction.
 */
router.patch('/:id/approve', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });
    if (userRole !== 'PM') {
      return res.status(403).json({ success: false, error: 'Forbidden: Only PM can approve.' });
    }

    const taskId = Number(req.params.id);
    if (!taskId || isNaN(taskId)) return res.status(400).json({ success: false, error: 'Invalid task ID.' });

    const taskRes = await client.query(
      'SELECT t.*, p.deleted_at AS project_deleted, p.manager_id FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1',
      [taskId]
    );
    if (taskRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found.' });
    const task = taskRes.rows[0];
    if (task.deleted_at) return res.status(404).json({ success: false, error: 'Task not found.' });
    if (task.project_deleted) return res.status(404).json({ success: false, error: 'Project not found.' });
    if (task.manager_id !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden: Only the project owner PM can approve.' });
    }

    const hasAccess = await checkProjectAccess(client, task.project_id, userId, userRole);
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Forbidden: No access to this project.' });

    if (task.status !== 'REVIEW') {
      return res.status(400).json({ success: false, error: 'Task must be Under Review to approve.' });
    }
    if (task.tl_recommendation !== 'recommended') {
      return res.status(400).json({ success: false, error: 'TL recommendation required before PM approval.' });
    }
    if (!task.submission_id) {
      return res.status(400).json({ success: false, error: 'No submission to approve.' });
    }

    // verify recommendation exists for current submission
    const recRes = await client.query(
      "SELECT 1 FROM task_reviews WHERE task_id = $1 AND submission_id = $2 AND action = 'recommend_approval' ORDER BY created_at DESC LIMIT 1",
      [taskId, task.submission_id]
    );
    if (recRes.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'No TL recommendation for the current submission.' });
    }

    const { feedback } = req.body || {};
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO task_reviews (task_id, author_id, author_name, author_role, action, comment, submission_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [taskId, userId, req.user?.name || '', 'PM', 'final_approve', feedback || null, task.submission_id]
    );

    // Look up the project's completion status
    const statusesTableExistsLocal = await taskStatusesTableExists(client);
    let completionStatusName = 'Completed';
    let completionStatusId: number | null = null;
    if (statusesTableExistsLocal) {
      const completionRes = await client.query(
        'SELECT id, name FROM task_statuses WHERE project_id = $1 AND is_completion_status = TRUE LIMIT 1',
        [task.project_id]
      );
      if (completionRes.rows.length === 0) {
        await client.query('ROLLBACK').catch(() => {});
        return res.status(400).json({ success: false, error: 'No completion status configured for this project.' });
      }
      completionStatusName = completionRes.rows[0].name;
      completionStatusId = completionRes.rows[0].id;
    }

    if (completionStatusId !== null) {
      await client.query(
        'UPDATE tasks SET status = $1, status_id = $2, tl_recommendation = NULL, review_feedback = $3, approved_at = CURRENT_TIMESTAMP, approved_by_id = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5',
        [completionStatusName, completionStatusId, feedback || null, userId, taskId]
      );
    } else {
      await client.query(
        'UPDATE tasks SET status = $1, tl_recommendation = NULL, review_feedback = $2, approved_at = CURRENT_TIMESTAMP, approved_by_id = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4',
        [completionStatusName, feedback || null, userId, taskId]
      );
    }
    await client.query('COMMIT');
    
    // Get the updated task with task number and key
    const finalTaskRes = await client.query(
      'SELECT t.*, p.project_key FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1',
      [taskId]
    );
    const finalTask = finalTaskRes.rows[0];
    
    return res.status(200).json({
      success: true,
      message: 'Task approved and completed.',
      status: completionStatusName,
      taskNumber: finalTask.task_number || null,
      taskKey: finalTask.task_number ? `${finalTask.project_key}-${finalTask.task_number}` : null,
    });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('PATCH /api/tasks/:id/approve error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to approve task.' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/tasks/notifications
 * Get notifications for the authenticated user.
 */
router.get('/notifications', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });

    const { unreadOnly } = req.query;
    const query = unreadOnly === 'true'
      ? 'SELECT id, title, message, type, read, task_id, project_id, bug_id, created_at FROM notifications WHERE user_id = $1 AND read = FALSE ORDER BY created_at DESC'
      : 'SELECT id, title, message, type, read, task_id, project_id, bug_id, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC';

    const result = await client.query(query, [userId]);
    return res.status(200).json({
      success: true,
      count: result.rows.length,
      notifications: result.rows.map((n: any) => ({
        id: String(n.id),
        title: n.title,
        message: n.message,
        type: n.type,
        read: n.read,
        taskId: n.task_id ? String(n.task_id) : null,
        projectId: n.project_id ? String(n.project_id) : null,
        bugId: n.bug_id ? String(n.bug_id) : null,
        timestamp: n.created_at,
      })),
    });
  } catch (err: any) {
    console.error('GET notifications error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to retrieve notifications.' });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/tasks/notifications/:id/read
 * Mark a notification as read.
 */
router.patch('/notifications/:id/read', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });

    const notificationId = Number(req.params.id);
    if (!notificationId || isNaN(notificationId)) return res.status(400).json({ success: false, error: 'Invalid notification ID.' });

    const result = await client.query(
      'UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2 RETURNING id',
      [notificationId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Notification not found.' });
    }

    return res.status(200).json({ success: true, message: 'Notification marked as read.' });
  } catch (err: any) {
    console.error('PATCH notification read error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to mark notification as read.' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/tasks/:id
 * Get a single task (excludes soft-deleted)
 */
router.get('/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });

    const taskId = Number(req.params.id);
    if (!taskId || isNaN(taskId)) return res.status(400).json({ success: false, error: 'Invalid task ID.' });

    const taskRes = await client.query(
      `SELECT t.*, p.deleted_at AS project_deleted, p.manager_id, p.project_key, u.name AS 
 assigned_to_name
       FROM tasks t JOIN projects p ON p.id = t.project_id LEFT JOIN users u ON u.id = t.assigned_to_id
       WHERE t.id = $1`,
      [taskId],
    );
    const task = taskRes.rows[0];
    if (task.deleted_at) return res.status(404).json({ success: false, error: 'Task not found.' });
    if (task.project_deleted) return res.status(404).json({ success: false, error: 'Project not found.' });

    const hasAccess = await checkProjectAccess(client, task.project_id, userId, userRole);
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Forbidden: No access to this project.' });

    // Phase 1: auto-mark SEEN on first view by assigned TM
    if (userRole === 'TM' && task.assigned_to_id === userId && String(task.status || '').toUpperCase() === 'TODO' && !task.first_viewed_at) {
      await client.query('UPDATE tasks SET status=$1, first_viewed_at=NOW(), updated_at=NOW() WHERE id=$2', ['SEEN', taskId]);
      task.status = 'SEEN';
      task.first_viewed_at = new Date();
    }

    // subtasks
    const subRes = await client.query('SELECT id, title, completed FROM subtasks WHERE task_id = $1 ORDER BY "order" ASC, id ASC', [taskId]);
    // comments
    const comRes = await client.query('SELECT id, author_name, author_role, author_initials, content, created_at FROM task_comments WHERE task_id = $1 ORDER BY created_at ASC', [taskId]);
    // attachments
    const attRes = await client.query('SELECT id, name, size, type, file_url, uploaded_by, uploaded_at FROM task_attachments WHERE task_id = $1 ORDER BY uploaded_at ASC', [taskId]);
    // reviews
    const revRes = await client.query('SELECT id, author_id, author_name, author_role, action, comment, submission_id, created_at FROM task_reviews WHERE task_id = $1 ORDER BY created_at ASC', [taskId]);
    // submissions
    const submRes = await client.query('SELECT id, submitted_by, submitted_role, submitted_at, demo_url, description, version FROM task_submissions WHERE task_id = $1 ORDER BY version ASC', [taskId]);

    const statusMap: Record<string, string> = { TODO: 'Not Started', SEEN: 'Seen', IN_PROGRESS: 'In Progress', ON_HOLD: 'On Hold', REVIEW: 'Under Review', DONE: 'Completed' };
    const prioMap: Record<string, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', URGENT: 'Urgent' };

    return res.status(200).json({
      success: true,
      task: {
        id: String(task.id),
        projectId: String(task.project_id),
        title: task.title,
        description: task.description || '',
        status: statusMap[String(task.status || '').toUpperCase()] || 'Not Started',
        priority: prioMap[String(task.priority || '').toUpperCase()] || 'Medium',
        assignedToId: task.assigned_to_id ? String(task.assigned_to_id) : null,
        assignedTo: task.assigned_to_name || null,
        deadline: task.deadline ? String(task.deadline).slice(0, 10) : (task.due_date ? String(task.due_date).slice(0, 10) : null),
        createdAt: task.created_at,
        updatedAt: task.updated_at,
        tlRecommendation: task.tl_recommendation || undefined,
        reviewFeedback: task.review_feedback || undefined,
        submissionId: task.submission_id ? String(task.submission_id) : null,
        statusId: task.status_id ? String(task.status_id) : null,
        firstViewedAt: task.first_viewed_at || null,
        onHoldReason: task.on_hold_reason || null,
        subtasks: subRes.rows.map((s: any) => ({ id: String(s.id), title: s.title, completed: Boolean(s.completed) })),
        comments: comRes.rows.map((c: any) => ({ id: String(c.id), authorName: c.author_name, authorRole: c.author_role, authorInitials: c.author_initials, content: c.content, timestamp: c.created_at })),
        attachments: attRes.rows.map((a: any) => ({ id: String(a.id), name: a.name, size: a.size, type: a.type, fileUrl: a.file_url, uploadedBy: a.uploaded_by ? String(a.uploaded_by) : '', uploadedAt: a.uploaded_at })),
        reviews: revRes.rows.map((r: any) => ({ id: String(r.id), authorId: r.author_id ? String(r.author_id) : null, authorName: r.author_name, authorRole: r.author_role, action: r.action, comment: r.comment, submissionId: r.submission_id ? String(r.submission_id) : null, timestamp: r.created_at })),
        submissions: submRes.rows.map((s: any) => ({ id: String(s.id), submittedBy: s.submitted_by ? String(s.submitted_by) : null, submittedRole: s.submitted_role, submittedAt: s.submitted_at, demoUrl: s.demo_url, description: s.description, version: s.version })),
        taskNumber: task.task_number || null,
        taskKey: task.task_number ? `${task.project_key}-${task.task_number}` : null,
      },
    });
  } catch (err: any) {
    console.error('GET /api/tasks/:id error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to retrieve task.' });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/tasks/:id/status
 * Update task status to a project-specific status. Access:
 *   PM/TL: any task in authorized project.
 *   TM: only own assigned tasks.
 *   Tester: only own assigned testing tasks.
 * Rejects completion status (only PM approval endpoint can complete).
 */
router.patch('/:id/status', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });

    const taskId = Number(req.params.id);
    if (!taskId || isNaN(taskId)) return res.status(400).json({ success: false, error: 'Invalid task ID.' });

    const { statusId } = req.body || {};
    if (!statusId || isNaN(Number(statusId))) {
      return res.status(400).json({ success: false, error: 'Status ID is required.' });
    }

    const targetStatusId = Number(statusId);

    // Fetch task with project info
    const taskRes = await client.query(
      'SELECT t.*, p.deleted_at AS project_deleted FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1',
      [taskId]
    );
    if (taskRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found.' });
    const task = taskRes.rows[0];
    if (task.deleted_at) return res.status(404).json({ success: false, error: 'Task not found.' });
    if (task.project_deleted) return res.status(404).json({ success: false, error: 'Project not found.' });

    // Migration 020 required for status-specific operations
    const statusesTableExistsLocal = await taskStatusesTableExists(client);
    if (!statusesTableExistsLocal) {
      return res.status(501).json({
        success: false,
        error: 'Migration 020 not applied: task_statuses table does not exist. Cannot update task status to a project-specific status.',
      });
    }

    // Verify the target status exists and belongs to this project
    const statusRes = await client.query(
      'SELECT id, name, is_completion_status FROM task_statuses WHERE id = $1 AND project_id = $2',
      [targetStatusId, task.project_id]
    );
    if (statusRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Status not found in this project.' });
    }
    const targetStatus = statusRes.rows[0];

    // Reject completion status via this endpoint (only PM approval can complete)
    if (targetStatus.is_completion_status) {
      return res.status(400).json({
        success: false,
        error: 'Cannot set completion status via this endpoint. Use the PM approval workflow.',
      });
    }

    // Role-based authorization
    if (userRole === 'TM') {
      if (task.assigned_to_id !== userId) {
        return res.status(403).json({ success: false, error: 'Forbidden: Only the assigned user can update this task status.' });
      }
    } else if (userRole === 'TESTER') {
      // Tester can only update testing tasks assigned to themselves
      if (task.assigned_to_id !== userId) {
        return res.status(403).json({ success: false, error: 'Forbidden: Only the assigned tester can update this task status.' });
      }
    } else if (userRole === 'PM' || userRole === 'TL') {
      // PM/TL can update any task in authorized project
    } else {
      return res.status(403).json({ success: false, error: 'Forbidden: Unauthorized role.' });
    }

    const hasAccess = await checkProjectAccess(client, task.project_id, userId, userRole);
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Forbidden: No access to this project.' });

    await client.query(
      'UPDATE tasks SET status = $1, status_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [targetStatus.name, targetStatusId, taskId]
    );

    return res.status(200).json({
      success: true,
      message: 'Task status updated.',
      status: targetStatus.name,
      statusId: String(targetStatusId),
    });
  } catch (err: any) {
    console.error('PATCH /api/tasks/:id/status error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to update task status.' });
  } finally {
    client.release();
  }
});

/**
 * Subtasks CRUD
 */
router.post('/:id/subtasks', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });
    const taskId = Number(req.params.id);
    if (!taskId || isNaN(taskId)) return res.status(400).json({ success: false, error: 'Invalid task ID.' });

    const taskRes = await client.query('SELECT t.project_id, t.deleted_at, p.deleted_at AS project_deleted FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1', [taskId]);
    if (taskRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found.' });
    const task = taskRes.rows[0];
    if (task.deleted_at) return res.status(404).json({ success: false, error: 'Task not found.' });
    if (task.project_deleted) return res.status(404).json({ success: false, error: 'Project not found.' });

    const hasAccess = await checkProjectAccess(client, task.project_id, userId, userRole);
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Forbidden: No access to this project.' });

    const { title } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ success: false, error: 'Subtask title is required.' });

    const result = await client.query(
      'INSERT INTO subtasks (task_id, title, completed, "order") VALUES ($1, $2, FALSE, (SELECT COALESCE(MAX("order"),0)+1 FROM subtasks WHERE task_id=$1)) RETURNING id, title, completed',
      [taskId, String(title).trim()]
    );
    const s = result.rows[0];
    return res.status(201).json({ success: true, subtask: { id: String(s.id), title: s.title, completed: Boolean(s.completed) } });
  } catch (err: any) {
    console.error('POST subtasks error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to create subtask.' });
  } finally {
    client.release();
  }
});

router.patch('/:id/subtasks/:sid', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });

    const taskId = Number(req.params.id);
    const subtaskId = Number(req.params.sid);
    if (!taskId || isNaN(taskId) || !subtaskId || isNaN(subtaskId)) return res.status(400).json({ success: false, error: 'Invalid IDs.' });

    const taskRes = await client.query('SELECT t.project_id, t.assigned_to_id, t.deleted_at, p.deleted_at AS project_deleted FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1', [taskId]);
    if (taskRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found.' });
    const task = taskRes.rows[0];
    if (task.deleted_at) return res.status(404).json({ success: false, error: 'Task not found.' });
    if (task.project_deleted) return res.status(404).json({ success: false, error: 'Project not found.' });

    const hasAccess = await checkProjectAccess(client, task.project_id, userId, userRole);
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Forbidden: No access to this project.' });

    const subRes = await client.query('SELECT id FROM subtasks WHERE id = $1 AND task_id = $2', [subtaskId, taskId]);
    if (subRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Subtask not found.' });

    const { title, completed } = req.body || {};
    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ success: false, error: 'Subtask title cannot be empty.' });
      // only PM/TL can rename
      if (userRole !== 'PM' && userRole !== 'TL') return res.status(403).json({ success: false, error: 'Forbidden: Only PM/TL can rename subtasks.' });
      updates.push('title = $' + idx++); params.push(title.trim());
    }
    if (completed !== undefined) {
      if (typeof completed !== 'boolean') return res.status(400).json({ success: false, error: 'completed must be boolean.' });
      // TM can toggle only if assigned to task
      if (userRole === 'TM' && task.assigned_to_id !== userId) {
        return res.status(403).json({ success: false, error: 'Forbidden: You can only update subtasks of your assigned tasks.' });
      }
      updates.push('completed = $' + idx++); params.push(completed);
    }
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No valid fields to update.' });
    params.push(subtaskId);
    await client.query('UPDATE subtasks SET ' + updates.join(', ') + ' WHERE id = $' + idx, params);
    return res.status(200).json({ success: true, message: 'Subtask updated.' });
  } catch (err: any) {
    console.error('PATCH subtask error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to update subtask.' });
  } finally {
    client.release();
  }
});

router.delete('/:id/subtasks/:sid', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });
    if (userRole !== 'PM' && userRole !== 'TL') {
      return res.status(403).json({ success: false, error: 'Forbidden: Only PM/TL can delete subtasks.' });
    }
    const taskId = Number(req.params.id);
    const subtaskId = Number(req.params.sid);
    if (!taskId || isNaN(taskId) || !subtaskId || isNaN(subtaskId)) return res.status(400).json({ success: false, error: 'Invalid IDs.' });

    const taskRes = await client.query('SELECT t.project_id, t.deleted_at, p.deleted_at AS project_deleted FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1', [taskId]);
    if (taskRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found.' });
    const task = taskRes.rows[0];
    if (task.deleted_at) return res.status(404).json({ success: false, error: 'Task not found.' });
    if (task.project_deleted) return res.status(404).json({ success: false, error: 'Project not found.' });

    const hasAccess = await checkProjectAccess(client, task.project_id, userId, userRole);
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Forbidden: No access to this project.' });

    const del = await client.query('DELETE FROM subtasks WHERE id = $1 AND task_id = $2', [subtaskId, taskId]);
    if (del.rowCount === 0) return res.status(404).json({ success: false, error: 'Subtask not found.' });
    return res.status(200).json({ success: true, message: 'Subtask deleted.' });
  } catch (err: any) {
    console.error('DELETE subtask error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to delete subtask.' });
  } finally {
    client.release();
  }
});

/**
 * Comments
 */
router.post('/:id/comments', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });

    const taskId = Number(req.params.id);
    if (!taskId || isNaN(taskId)) return res.status(400).json({ success: false, error: 'Invalid task ID.' });

    const taskRes = await client.query('SELECT t.project_id, t.deleted_at, p.deleted_at AS project_deleted FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1', [taskId]);
    if (taskRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found.' });
    const task = taskRes.rows[0];
    if (task.deleted_at) return res.status(404).json({ success: false, error: 'Task not found.' });
    if (task.project_deleted) return res.status(404).json({ success: false, error: 'Project not found.' });

    const hasAccess = await checkProjectAccess(client, task.project_id, userId, userRole);
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Forbidden: No access to this project.' });

    const { content } = req.body || {};
    if (!content || !String(content).trim()) return res.status(400).json({ success: false, error: 'Comment content is required.' });

    const userRes = await client.query('SELECT name FROM users WHERE id = $1', [userId]);
    const authorName = userRes.rows[0]?.name || req.user?.name || 'Unknown';
    const initials = authorName.split(/[\s._-]+/).slice(0, 2).map((s: string) => s.charAt(0).toUpperCase()).join('') || 'U';

    const result = await client.query(
      'INSERT INTO task_comments (task_id, author_name, author_role, author_initials, content, author_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at',
      [taskId, authorName, userRole, initials, String(content).trim(), userId]
    );
    const c = result.rows[0];
    return res.status(201).json({
      success: true,
      comment: { id: String(c.id), authorName, authorRole: userRole, authorInitials: initials, content: String(content).trim(), timestamp: c.created_at },
    });
  } catch (err: any) {
    console.error('POST comment error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to add comment.' });
  } finally {
    client.release();
  }
});

/**
 * Attachments
 */
const uploadDir = path.join(process.cwd(), 'uploads', 'tasks');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'video/mp4', 'video/webm'];
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.mp4', '.webm'];

const storage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: any) => cb(null, uploadDir),
  filename: (_req: any, file: any, cb: any) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ALLOWED_EXTENSIONS.includes(ext) ? ext : '';
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}${safeExt}`;
    cb(null, unique);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req: any, file: any, cb: any) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(new Error('Invalid file extension.'));
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Invalid file type.'));
    }
    cb(null, true);
  },
});

function validateFileContent(buffer: Buffer, mimetype: string): boolean {
  if (!buffer || buffer.length === 0) return false;
  if (mimetype === 'image/png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  if (mimetype === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimetype === 'image/gif') {
    return buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46;
  }
  if (mimetype === 'image/webp') {
    return buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
  }
  if (mimetype === 'application/pdf') {
    return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  }
  return true;
}

router.post('/:id/attachments', authenticateToken, (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, error: 'File too large. Maximum size is 10MB.' });
      }
      return res.status(400).json({ success: false, error: err.message || 'File upload failed.' });
    }
    next();
  });
}, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });

    const taskId = Number(req.params.id);
    if (!taskId || isNaN(taskId)) return res.status(400).json({ success: false, error: 'Invalid task ID.' });

    const taskRes = await client.query('SELECT t.project_id, t.deleted_at, p.deleted_at AS project_deleted FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1', [taskId]);
    if (taskRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found.' });
    const task = taskRes.rows[0];
    if (task.deleted_at) return res.status(404).json({ success: false, error: 'Task not found.' });
    if (task.project_deleted) return res.status(404).json({ success: false, error: 'Project not found.' });

    const hasAccess = await checkProjectAccess(client, task.project_id, userId, userRole);
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Forbidden: No access to this project.' });

    if (!(req as any).file) return res.status(400).json({ success: false, error: 'No file uploaded.' });

    const uploadedFile = (req as any).file;
    let fileBuffer: Buffer;
    try {
      fileBuffer = fs.readFileSync(uploadedFile.path);
    } catch {
      try { fs.unlinkSync(uploadedFile.path); } catch {}
      return res.status(400).json({ success: false, error: 'Failed to read uploaded file.' });
    }
    if (!validateFileContent(fileBuffer, uploadedFile.mimetype)) {
      try { fs.unlinkSync(uploadedFile.path); } catch {}
      return res.status(400).json({ success: false, error: 'File content does not match its declared type.' });
    }

    // check count
    const countRes = await client.query('SELECT COUNT(*) AS c FROM task_attachments WHERE task_id = $1', [taskId]);
    if (Number(countRes.rows[0].c) >= 5) {
      // remove uploaded file
      try { fs.unlinkSync((req as any).file.path); } catch {}
      return res.status(400).json({ success: false, error: 'Maximum 5 attachments per task.' });
    }

    const result = await client.query(
      'INSERT INTO task_attachments (task_id, name, size, type, file_url, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, uploaded_at',
      [taskId, (req as any).file.originalname, (req as any).file.size, (req as any).file.mimetype, (req as any).file.filename, userId]
    );
    const a = result.rows[0];
    return res.status(201).json({
      success: true,
      attachment: {
        id: String(a.id),
        name: (req as any).file.originalname,
        size: (req as any).file.size,
        type: (req as any).file.mimetype,
        fileUrl: (req as any).file.filename,
        uploadedBy: String(userId),
        uploadedAt: a.uploaded_at,
      },
    });
  } catch (err: any) {
    console.error('POST attachment error:', err.message);
    if ((req as any).file) try { fs.unlinkSync((req as any).file.path); } catch {}
    return res.status(500).json({ success: false, error: err.message || 'Failed to upload attachment.' });
  } finally {
    client.release();
  }
});

router.get('/:id/attachments/:aid/download', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });

    const taskId = Number(req.params.id);
    const attId = Number(req.params.aid);
    if (!taskId || isNaN(taskId) || !attId || isNaN(attId)) return res.status(400).json({ success: false, error: 'Invalid IDs.' });

    const taskRes = await client.query('SELECT t.project_id, t.deleted_at, p.deleted_at AS project_deleted FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1', [taskId]);
    if (taskRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found.' });
    const task = taskRes.rows[0];
    if (task.deleted_at) return res.status(404).json({ success: false, error: 'Task not found.' });
    if (task.project_deleted) return res.status(404).json({ success: false, error: 'Project not found.' });

    const hasAccess = await checkProjectAccess(client, task.project_id, userId, userRole);
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Forbidden: No access to this project.' });

    const attRes = await client.query('SELECT name, file_url FROM task_attachments WHERE id = $1 AND task_id = $2', [attId, taskId]);
    if (attRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Attachment not found.' });

    const safeName = path.basename(String(attRes.rows[0].file_url));
    const filePath = path.join(uploadDir, safeName);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(uploadDir) + path.sep)) {
      return res.status(400).json({ success: false, error: 'Invalid file path.' });
    }
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: 'File not found on server.' });
    res.download(filePath, attRes.rows[0].name);
  } catch (err: any) {
    console.error('Download attachment error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to download attachment.' });
  } finally {
    client.release();
  }
});

router.delete('/:id/attachments/:aid', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });

    const taskId = Number(req.params.id);
    const attId = Number(req.params.aid);
    if (!taskId || isNaN(taskId) || !attId || isNaN(attId)) return res.status(400).json({ success: false, error: 'Invalid IDs.' });

    const taskRes = await client.query('SELECT t.project_id, t.deleted_at, p.deleted_at AS project_deleted FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1', [taskId]);
    if (taskRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found.' });
    const task = taskRes.rows[0];
    if (task.deleted_at) return res.status(404).json({ success: false, error: 'Task not found.' });
    if (task.project_deleted) return res.status(404).json({ success: false, error: 'Project not found.' });

    const hasAccess = await checkProjectAccess(client, task.project_id, userId, userRole);
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Forbidden: No access to this project.' });

    const attRes = await client.query('SELECT file_url, uploaded_by FROM task_attachments WHERE id = $1 AND task_id = $2', [attId, taskId]);
    if (attRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Attachment not found.' });

    const att = attRes.rows[0];
    // only uploader, PM, or TL can delete
    if (String(att.uploaded_by) !== String(userId) && userRole !== 'PM' && userRole !== 'TL') {
      return res.status(403).json({ success: false, error: 'Forbidden: Cannot delete this attachment.' });
    }

    await client.query('DELETE FROM task_attachments WHERE id = $1 AND task_id = $2', [attId, taskId]);
    try { fs.unlinkSync(path.join(uploadDir, path.basename(String(att.file_url)))); } catch {}
    return res.status(200).json({ success: true, message: 'Attachment deleted.' });
  } catch (err: any) {
    console.error('DELETE attachment error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to delete attachment.' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/tasks/:id/submissions
 */
router.get('/:id/submissions', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });

    const taskId = Number(req.params.id);
    if (!taskId || isNaN(taskId)) return res.status(400).json({ success: false, error: 'Invalid task ID.' });

    const taskRes = await client.query('SELECT t.project_id, t.deleted_at, p.deleted_at AS project_deleted FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1', [taskId]);
    if (taskRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found.' });
    const task = taskRes.rows[0];
    if (task.deleted_at) return res.status(404).json({ success: false, error: 'Task not found.' });
    if (task.project_deleted) return res.status(404).json({ success: false, error: 'Project not found.' });

    const hasAccess = await checkProjectAccess(client, task.project_id, userId, userRole);
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Forbidden: No access to this project.' });

    const result = await client.query('SELECT id, submitted_by, submitted_role, submitted_at, demo_url, description, version FROM task_submissions WHERE task_id = $1 ORDER BY version ASC', [taskId]);
    return res.status(200).json({
      success: true,
      count: result.rows.length,
      submissions: result.rows.map((s: any) => ({
        id: String(s.id),
        submittedBy: s.submitted_by ? String(s.submitted_by) : null,
        submittedRole: s.submitted_role,
        submittedAt: s.submitted_at,
        demoUrl: s.demo_url,
        description: s.description,
        version: s.version,
      })),
    });
  } catch (err: any) {
    console.error('GET submissions error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to retrieve submissions.' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/tasks/:id/bugs
 * Get all bugs linked to a task.
 */
router.get('/:id/bugs', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });

    const taskId = Number(req.params.id);
    if (!taskId || isNaN(taskId)) return res.status(400).json({ success: false, error: 'Invalid task ID.' });

    const taskRes = await client.query(
      'SELECT t.project_id, t.deleted_at, p.deleted_at AS project_deleted FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1',
      [taskId]
    );
    if (taskRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found.' });
    const task = taskRes.rows[0];
    if (task.deleted_at) return res.status(404).json({ success: false, error: 'Task not found.' });
    if (task.project_deleted) return res.status(404).json({ success: false, error: 'Project not found.' });

    const hasAccess = await checkProjectAccess(client, task.project_id, userId, userRole);
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Forbidden: No access to this project.' });

    const result = await client.query(
      `SELECT b.id, b.title, b.description, b.severity, b.reproduction_steps AS reproductionSteps,
              b.status, b.assigned_to AS assignedToId, u.name AS assignedToName,
              b.reported_by AS reportedById, ru.name AS reportedByName,
              b.resolution_notes AS resolutionNotes, b.verified_by AS verifiedById, v.name AS verifiedByName,
              b.verified_at AS verifiedAt, b.created_at AS createdAt, b.updated_at AS updatedAt
       FROM bugs b
       LEFT JOIN users u ON u.id = b.assigned_to
       LEFT JOIN users ru ON ru.id = b.reported_by
       LEFT JOIN users v ON v.id = b.verified_by
       WHERE b.task_id = $1
       ORDER BY b.created_at DESC`,
      [taskId]
    );
    return res.status(200).json({
      success: true,
      count: result.rows.length,
      bugs: result.rows.map((b: any) => ({
        id: String(b.id),
        taskId: String(taskId),
        projectId: String(task.project_id),
        title: b.title,
        description: b.description || '',
        severity: b.severity,
        reproductionSteps: b.reproductionSteps || '',
        status: b.status,
        assignedTo: b.assignedToName || null,
        assignedToId: b.assignedToId ? String(b.assignedToId) : null,
        reportedBy: b.reportedByName || 'Unknown',
        reportedById: b.reportedById ? String(b.reportedById) : null,
        reportedAt: b.createdAt,
        resolutionNotes: b.resolutionNotes || null,
        verifiedBy: b.verifiedByName || null,
        verifiedAt: b.verifiedAt || null,
        updatedAt: b.updatedAt,
      })),
    });
  } catch (err: any) {
    console.error('GET bugs error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to retrieve bugs.' });
  } finally {
    client.release();
  }
});

/**
 * Helper: create a notification for a user.
 */
async function createNotification(
  client: any,
  userId: number,
  title: string,
  message: string,
  type: 'info' | 'success' | 'warning' | 'error' = 'info',
  taskId?: number,
  projectId?: number,
  bugId?: number
) {
  await client.query(
    `INSERT INTO notifications (user_id, title, message, type, task_id, project_id, bug_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, title, message, type, taskId ?? null, projectId ?? null, bugId ?? null]
  );
}

/**
 * PATCH /api/tasks/:id/report-bug
 * Tester reports a bug on a task. Creates bug record and sets task status to BUG_FIX_REQUIRED.
 */
router.patch('/:id/report-bug', authenticateToken, requireRoles('TESTER'), async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userName = req.user?.name || 'Tester';
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });

    const taskId = Number(req.params.id);
    if (!taskId || isNaN(taskId)) return res.status(400).json({ success: false, error: 'Invalid task ID.' });

    const { title, description, severity, reproductionSteps } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ success: false, error: 'Bug title is required.' });
    if (!description || !description.trim()) return res.status(400).json({ success: false, error: 'Bug description is required.' });

    // Fetch task to verify access and assignment
    const taskRes = await client.query(
      `SELECT t.*, p.deleted_at AS project_deleted FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1`,
      [taskId]
    );
    if (taskRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found.' });
    const task = taskRes.rows[0];
    if (task.deleted_at) return res.status(404).json({ success: false, error: 'Task not found.' });
    if (task.project_deleted) return res.status(404).json({ success: false, error: 'Project not found.' });

    const hasAccess = await checkProjectAccess(client, task.project_id, userId, userRole);
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Forbidden: No access to this project.' });

    await client.query('BEGIN');

    // Insert bug record
    const bugRes = await client.query(
      `INSERT INTO bugs (task_id, project_id, title, description, severity, reproduction_steps, reported_by, status, assigned_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'Open', $8)
       RETURNING id, title, status, created_at`,
      [taskId, task.project_id, title.trim(), description.trim(), severity || 'Medium', reproductionSteps || null, userId, task.assigned_to_id ?? null]
    );
    const bug = bugRes.rows[0];

    // Set task status to BUG_FIX_REQUIRED
    await client.query(
      'UPDATE tasks SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['BUG_FIX_REQUIRED', taskId]
    );

    // Record review history entry
    await client.query(
      `INSERT INTO task_reviews (task_id, author_id, author_name, author_role, action, comment, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [taskId, userId, userName, 'TESTER', 'fail_testing', `Bug reported: ${title.trim()}. ${description.trim()}`]
    );

    // Create notifications for assigned TM and TL
    const assignedTmId = task.assigned_to_id;
    if (assignedTmId && assignedTmId !== userId) {
      await createNotification(client, assignedTmId, 'Bug Reported on Your Task', `A bug ("${title.trim()}") has been reported on task #${taskId}. Please fix and resubmit.`, 'warning', taskId, task.project_id, bug.id);
    }
    // Notify TLs of the project (team leaders on this project)
    const tlRes = await client.query(
      `SELECT u.id FROM users u WHERE u.role = 'TL' AND u.is_active = TRUE`
    );
    for (const row of tlRes.rows) {
      await createNotification(client, row.id, 'Bug Reported', `Tester reported a bug ("${title.trim()}") on task #${taskId}.`, 'info', taskId, task.project_id, bug.id);
    }

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'Bug reported successfully.',
      bug: { id: String(bug.id), title: bug.title, status: bug.status, createdAt: bug.created_at },
      taskStatus: 'BUG_FIX_REQUIRED',
    });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Report bug error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to report bug.' });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/tasks/:id/verify-bug
 * Tester verifies a bug fix (pass/fail). Updates bug status and task status accordingly.
 */
router.patch('/:id/verify-bug', authenticateToken, requireRoles('TESTER'), async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userName = req.user?.name || 'Tester';
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });

    const taskId = Number(req.params.id);
    if (!taskId || isNaN(taskId)) return res.status(400).json({ success: false, error: 'Invalid task ID.' });

    const { bugId, verified, verificationNotes } = req.body;
    if (!bugId) return res.status(400).json({ success: false, error: 'Bug ID is required.' });

    // Fetch task to verify access
    const taskRes = await client.query(
      `SELECT t.*, p.deleted_at AS project_deleted FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1`,
      [taskId]
    );
    if (taskRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found.' });
    const task = taskRes.rows[0];
    if (task.deleted_at) return res.status(404).json({ success: false, error: 'Task not found.' });
    if (task.project_deleted) return res.status(404).json({ success: false, error: 'Project not found.' });

    const hasAccess = await checkProjectAccess(client, task.project_id, userId, userRole);
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Forbidden: No access to this project.' });

    // Verify the bug belongs to this task
    const bugRes = await client.query('SELECT * FROM bugs WHERE id = $1 AND task_id = $2', [bugId, taskId]);
    if (bugRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Bug not found on this task.' });
    const bug = bugRes.rows[0];

    await client.query('BEGIN');

    if (verified) {
      // Bug verified as fixed
      await client.query(
        `UPDATE bugs SET status = 'Verified', verified_by = $1, verified_at = NOW(), resolution_notes = COALESCE($2, resolution_notes), updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
        [userId, verificationNotes || null, bugId]
      );

      await client.query(
        `INSERT INTO task_reviews (task_id, author_id, author_name, author_role, action, comment, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [taskId, userId, userName, 'TESTER', 'pass_testing', `Bug #${bugId} verified as fixed. ${verificationNotes || ''}`.trim()]
      );

      // Check if there are any remaining open bugs on this task
      const openBugs = await client.query("SELECT id FROM bugs WHERE task_id = $1 AND status NOT IN ('Verified')", [taskId]);
      const taskStatus = openBugs.rows.length > 0 ? 'BUG_FIX_REQUIRED' : 'REVIEW';
      await client.query(
        'UPDATE tasks SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [taskStatus, taskId]
      );

      // Notify TM and TL
      const assignedTmId = task.assigned_to_id;
      if (assignedTmId && assignedTmId !== userId) {
        await createNotification(client, assignedTmId, 'Bug Verified Fixed', `Bug #${bugId} on task #${taskId} has been verified as fixed.`, 'success', taskId, task.project_id, bugId);
      }

      await client.query('COMMIT');

      return res.status(200).json({
        success: true,
        message: 'Bug verified as fixed.',
        bugStatus: 'Verified',
        taskStatus,
      });
    } else {
      // Bug not fixed, reopen
      await client.query(
        `UPDATE bugs SET status = 'Reopened', verified_by = $1, verified_at = NOW(), resolution_notes = COALESCE($2, resolution_notes), updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
        [userId, verificationNotes || null, bugId]
      );

      await client.query(
        `INSERT INTO task_reviews (task_id, author_id, author_name, author_role, action, comment, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [taskId, userId, userName, 'TESTER', 'fail_testing', `Bug #${bugId} verification failed. ${verificationNotes || ''}`.trim()]
      );

      await client.query(
        'UPDATE tasks SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['BUG_FIX_REQUIRED', taskId]
      );

      // Notify TM and TL
      const assignedTmId = task.assigned_to_id;
      if (assignedTmId && assignedTmId !== userId) {
        await createNotification(client, assignedTmId, 'Bug Verification Failed', `Bug #${bugId} on task #${taskId} was not verified as fixed. Please revise and resubmit.`, 'warning', taskId, task.project_id, bugId);
      }

      await client.query('COMMIT');

      return res.status(200).json({
        success: true,
        message: 'Bug verification failed. Task returned for correction.',
        bugStatus: 'Reopened',
        taskStatus: 'BUG_FIX_REQUIRED',
      });
    }
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Verify bug error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to verify bug.' });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/tasks/:id/request-final-corrections
 * PM requests final corrections at the approval stage. Requires feedback.
 */
router.patch('/:id/request-final-corrections', authenticateToken, requireRoles('PM'), async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userName = req.user?.name || 'PM';
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });

    const taskId = Number(req.params.id);
    if (!taskId || isNaN(taskId)) return res.status(400).json({ success: false, error: 'Invalid task ID.' });

    const { feedback } = req.body;
    if (!feedback || !feedback.trim()) return res.status(400).json({ success: false, error: 'Feedback is required for final corrections request.' });

    // Fetch task to verify access and current state
    const taskRes = await client.query(
      `SELECT t.*, p.deleted_at AS project_deleted FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1`,
      [taskId]
    );
    if (taskRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found.' });
    const task = taskRes.rows[0];
    if (task.deleted_at) return res.status(404).json({ success: false, error: 'Task not found.' });
    if (task.project_deleted) return res.status(404).json({ success: false, error: 'Project not found.' });

    const hasAccess = await checkProjectAccess(client, task.project_id, userId, userRole);
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Forbidden: No access to this project.' });

    // PM can only request final corrections on READY_FOR_APPROVAL or REVIEW tasks
    if (task.status !== 'READY_FOR_APPROVAL' && task.status !== 'REVIEW') {
      return res.status(400).json({
        success: false,
        error: `Cannot request final corrections on a task with status "${task.status}". Task must be Ready for Approval or Under Review.`,
      });
    }

    await client.query('BEGIN');

    // Set task status to CHANGES_REQUESTED
    await client.query(
      'UPDATE tasks SET status = $1, tl_recommendation = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['CHANGES_REQUESTED', taskId]
    );

    // Record review history entry
    await client.query(
      `INSERT INTO task_reviews (task_id, author_id, author_name, author_role, action, comment, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [taskId, userId, userName, 'PM', 'request_corrections', `Final corrections requested: ${feedback.trim()}`]
    );

    // Create notifications for assigned TM and TLs
    const assignedTmId = task.assigned_to_id;
    if (assignedTmId && assignedTmId !== userId) {
      await createNotification(client, assignedTmId, 'Final Corrections Requested', `Project Manager requested corrections on task #${taskId}. ${feedback.trim()}`, 'warning', taskId, task.project_id);
    }
    const tlRes = await client.query(`SELECT u.id FROM users u WHERE u.role = 'TL' AND u.is_active = TRUE`);
    for (const row of tlRes.rows) {
      await createNotification(client, row.id, 'Final Corrections Requested', `PM requested corrections on task #${taskId}.`, 'info', taskId, task.project_id);
    }

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Final corrections requested successfully.',
      taskStatus: 'CHANGES_REQUESTED',
    });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Request final corrections error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to request final corrections.' });
  } finally {
    client.release();
  }
});
export default router;



