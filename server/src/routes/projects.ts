import { Router, Request, Response } from 'express';
import { pool, taskStatusesTableExists } from '../db';
import { authenticateToken, requirePM, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

const VALID_PROJECT_STATUSES = ['Planning', 'In Progress', 'On Hold', 'Completed'];
const VALID_PROJECT_PRIORITIES = ['High', 'Medium', 'Low'];
const VALID_TEAM_ROLES = ['TL', 'TM', 'TESTER'];

function computeInitials(name: string): string {
  return (
    name
      .split(/[\s._-]+/)
      .slice(0, 2)
      .map((s) => s.charAt(0).toUpperCase())
      .join('') || 'U'
  );
}

function generateProjectKey(name: string): string {
  const base = name.replace(/[^A-Z]/gi, '').slice(0, 5);
  const prefix = base.length >= 2 ? base : 'PRJ';
  return prefix;
}

function normalizeProjectStatus(value: unknown): string {
  if (typeof value !== 'string') return 'Planning';
  const v = value.trim();
  const upper = v.toUpperCase();
  const mapping: Record<string, string> = {
    IN_PROGRESS: 'In Progress',
    TODO: 'Planning',
    DONE: 'Completed',
    ON_HOLD: 'On Hold',
    PLANNING: 'Planning',
    COMPLETED: 'Completed',
    'NOT STARTED': 'Planning',
    NOT_STARTED: 'Planning',
  };
  return mapping[upper] || (VALID_PROJECT_STATUSES.includes(v) ? v : 'Planning');
}

function normalizeProjectPriority(value: unknown): string {
  if (typeof value !== 'string') return 'Medium';
  const v = value.trim();
  const upper = v.toUpperCase();
  const mapping: Record<string, string> = {
    HIGH: 'High',
    MEDIUM: 'Medium',
    LOW: 'Low',
    URGENT: 'High',
  };
  return mapping[upper] || (VALID_PROJECT_PRIORITIES.includes(v) ? v : 'Medium');
}

function mapProjectRow(row: any): any {
  const teamMemberIds: string[] = Array.isArray(row.team_member_ids)
    ? row.team_member_ids.map((id: any) => String(id))
    : [];

  return {
    id: String(row.id),
    name: row.title || row.name || '',
    description: row.description || '',
    manager: {
      name: row.manager_name || 'Project Manager',
      role: row.manager_role || 'PM',
      avatarInitials: row.manager_name ? computeInitials(row.manager_name) : 'PM',
    },
    startDate: row.start_date || '',
    deadline: row.deadline || '',
    status: normalizeProjectStatus(row.status),
    progress: Number(row.progress) || 0,
    priority: normalizeProjectPriority(row.priority),
    tasksCount: {
      completed: Number(row.tasks_completed) || 0,
      total: Number(row.tasks_total) || 0,
    },
    teamLeaderId: row.team_leader_id ? String(row.team_leader_id) : undefined,
    teamMemberIds: teamMemberIds.length > 0 ? teamMemberIds : undefined,
    projectKey: row.project_key,
  };
}

export async function checkProjectAccess(
  client: any,
  projectId: number,
  userId: number,
  userRole: string
): Promise<boolean> {
  const role = userRole.toUpperCase();
  if (role === 'PM') {
    const result = await client.query(
      'SELECT 1 FROM projects WHERE id = $1 AND deleted_at IS NULL',
      [projectId]
    );
    return result.rows.length > 0;
  }
  const result = await client.query(
    `
    SELECT 1 FROM projects p
    LEFT JOIN project_team_members ptm ON ptm.project_id = p.id AND ptm.user_id = $2
    WHERE p.id = $1 AND p.deleted_at IS NULL AND (p.manager_id = $2 OR p.team_leader_id = $2 OR ptm.user_id IS NOT NULL)
    `,
    [projectId, userId]
  );
  return result.rows.length > 0;
}

async function checkProjectOwnership(
  client: any,
  projectId: number,
  userId: number
): Promise<boolean> {
  const result = await client.query(
    'SELECT 1 FROM projects WHERE id = $1 AND manager_id = $2 AND deleted_at IS NULL',
    [projectId, userId]
  );
  return result.rows.length > 0;
}

async function validateTeamMembers(
  client: any,
  teamLeaderId: number | null,
  teamMemberIds: number[]
): Promise<{ valid: boolean; error?: string }> {
  const allIds: number[] = [];
  if (teamLeaderId !== null) allIds.push(teamLeaderId);
  for (const id of teamMemberIds) {
    if (!allIds.includes(id)) allIds.push(id);
  }

  if (allIds.length === 0) return { valid: true };

  const result = await client.query(
    'SELECT id, role, is_active FROM users WHERE id = ANY($1::BIGINT[])',
    [allIds]
  );

  const userMap = new Map<number, { role: string; is_active: boolean }>();
  for (const u of result.rows) {
    userMap.set(Number(u.id), { role: String(u.role), is_active: Boolean(u.is_active) });
  }

  for (const id of allIds) {
    const u = userMap.get(id);
    if (!u) return { valid: false, error: `User ${id} does not exist.` };
    if (!u.is_active) return { valid: false, error: `User ${id} is not active.` };
    if (!VALID_TEAM_ROLES.includes(u.role.toUpperCase())) {
      return { valid: false, error: `User ${id} has invalid role ${u.role} for project team.` };
    }
  }

  if (teamLeaderId !== null) {
    const tl = userMap.get(teamLeaderId);
    if (!tl || tl.role.toUpperCase() !== 'TL') {
      return { valid: false, error: 'Team leader must have the TL role.' };
    }
  }

  return { valid: true };
}

/**
 * POST /api/projects
 * Creates a new project. Project Manager only.
 */
router.post('/', authenticateToken, requirePM, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const managerId = req.user?.id;
    if (!managerId) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    const {
      name,
      description,
      startDate,
      deadline,
      status,
      priority,
      teamLeaderId,
      teamMemberIds,
      statuses,
      projectKey,
    } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Project name is required.' });
    }

    const projectName = name.trim();
    const projectDescription = description && typeof description === 'string' ? description.trim() : '';
    const projectStatus = normalizeProjectStatus(status) || 'Planning';
    const projectPriority = normalizeProjectPriority(priority) || 'Medium';

    if (startDate && isNaN(new Date(startDate).getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid start date.' });
    }
    if (deadline && isNaN(new Date(deadline).getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid deadline.' });
    }
    if (startDate && deadline && new Date(deadline) < new Date(startDate)) {
      return res.status(400).json({
        success: false,
        error: 'Deadline cannot be earlier than the start date.',
      });
    }

    const parsedTeamLeaderId =
      teamLeaderId && String(teamLeaderId).trim() ? Number(teamLeaderId) : null;
    if (parsedTeamLeaderId !== null && (isNaN(parsedTeamLeaderId) || parsedTeamLeaderId <= 0)) {
      return res.status(400).json({ success: false, error: 'Invalid team leader ID.' });
    }

    const memberIds: number[] = [];
    if (Array.isArray(teamMemberIds)) {
      for (const id of teamMemberIds) {
        const num = Number(id);
        if (!isNaN(num) && num > 0 && !memberIds.includes(num)) memberIds.push(num);
      }
    }

    const validation = await validateTeamMembers(client, parsedTeamLeaderId, memberIds);
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    // Process projectKey
    let finalProjectKey = null;
    if (projectKey) {
      const providedKey = String(projectKey).trim().toUpperCase();
      if (!/^[A-Z][A-Z0-9]{1,9}$/.test(providedKey)) {
        return res.status(400).json({ success: false, error: 'Project key must be 2-10 characters, start with a letter, and contain only letters and numbers.' });
      }
      const keyCheck = await client.query('SELECT 1 FROM projects WHERE project_key = $1 AND deleted_at IS NULL', [providedKey]);
      if (keyCheck.rows.length > 0) {
        return res.status(409).json({ success: false, error: 'Project key is already taken.' });
      }
      finalProjectKey = providedKey;
    } else {
      // Generate projectKey from name
      finalProjectKey = generateProjectKey(projectName);
    }

    await client.query('BEGIN');

    const insertRes = await client.query(
      `INSERT INTO projects (title, name, description, start_date, deadline, status, priority, progress, team_leader_id, manager_id, project_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10)
       RETURNING id, title, name, description, start_date, deadline, status, priority, progress, team_leader_id, manager_id, created_at, updated_at, deleted_at, project_key`,
      [projectName, projectName, projectDescription, startDate || null, deadline || null, projectStatus, projectPriority, parsedTeamLeaderId, managerId, finalProjectKey]
    );

    const project = insertRes.rows[0];

    const allTeamIds: number[] = [];
    if (parsedTeamLeaderId !== null) allTeamIds.push(parsedTeamLeaderId);
    for (const id of memberIds) {
      if (!allTeamIds.includes(id)) allTeamIds.push(id);
    }

    if (allTeamIds.length > 0) {
      await client.query(
        `INSERT INTO project_team_members (project_id, user_id)
         SELECT $1, unnest($2::BIGINT[])
         ON CONFLICT (project_id, user_id) DO NOTHING`,
        [project.id, allTeamIds]
      );
    }

    // Insert task statuses for the new project (inside the same transaction)
    // Skips gracefully if migration 020 has not yet been applied.
    const statusesTableExists = await taskStatusesTableExists(client);
    if (statusesTableExists) {
      let projectStatuses = statuses;
      if (!Array.isArray(projectStatuses) || projectStatuses.length === 0) {
        // Default statuses
        projectStatuses = [
          { name: 'Not Started', color: null, sortOrder: 1, isCompletionStatus: false },
          { name: 'In Progress', color: null, sortOrder: 2, isCompletionStatus: false },
          { name: 'Under Review', color: null, sortOrder: 3, isCompletionStatus: false },
          { name: 'Completed', color: null, sortOrder: 4, isCompletionStatus: true },
        ];
      }

      // Ensure exactly one completion status
      let completionCount = 0;
      for (const s of projectStatuses) {
        if (s.isCompletionStatus) completionCount++;
      }
      if (completionCount !== 1) {
        // Default the last status as completion if not exactly one
        for (const s of projectStatuses) {
          s.isCompletionStatus = false;
        }
        if (projectStatuses.length > 0) {
          projectStatuses[projectStatuses.length - 1].isCompletionStatus = true;
        }
      }

      // Validate at least one status
      if (projectStatuses.length === 0) {
        await client.query('ROLLBACK').catch(() => {});
        return res.status(400).json({ success: false, error: 'At least one task status is required.' });
      }

      // Validate no duplicate names
      const names = projectStatuses.map((s: any) => String(s.name || '').trim());
      if (new Set(names).size !== names.length) {
        await client.query('ROLLBACK').catch(() => {});
        return res.status(400).json({ success: false, error: 'Duplicate status names are not allowed.' });
      }

      for (let i = 0; i < projectStatuses.length; i++) {
        const s = projectStatuses[i];
        const statusName = String(s.name || '').trim();
        if (!statusName) {
          await client.query('ROLLBACK').catch(() => {});
          return res.status(400).json({ success: false, error: 'Status name cannot be empty.' });
        }
        const color = s.color || null;
        const sortOrder = s.sortOrder !== undefined ? Number(s.sortOrder) : i + 1;
        const isCompletion = Boolean(s.isCompletionStatus);
        await client.query(
          `INSERT INTO task_statuses (project_id, name, sort_order, color, is_system, is_completion_status)
           VALUES ($1, $2, $3, $4, FALSE, $5)
           ON CONFLICT (project_id, name) DO NOTHING`,
          [project.id, statusName, sortOrder, color, isCompletion]
        );
      }
    } else {
      console.warn(
        `⚠️ Migration 020 not applied: task_statuses table missing. Project ${project.id} created without default statuses.`
      );
    }

    await client.query('COMMIT');

    const detailRes = await pool.query(
      `
      SELECT
        p.id, p.title, p.name, p.description,
        to_char(p.start_date, 'YYYY-MM-DD') AS start_date,
        to_char(p.deadline, 'YYYY-MM-DD') AS deadline,
        p.status,
        p.priority, p.progress, p.team_leader_id,
        m.id AS manager_id, m.name AS manager_name, m.role AS manager_role,
        COALESCE(tc.total, 0) AS tasks_total,
        COALESCE(tc.completed, 0) AS tasks_completed,
        COALESCE(array_agg(DISTINCT ptm.user_id) FILTER (WHERE ptm.user_id IS NOT NULL), ARRAY[]::BIGINT[]) AS team_member_ids
      FROM projects p
      LEFT JOIN users m ON p.manager_id = m.id
      LEFT JOIN project_team_members ptm ON ptm.project_id = p.id
      LEFT JOIN (
        SELECT project_id,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status = 'DONE') AS completed
        FROM tasks
        GROUP BY project_id
      ) tc ON tc.project_id = p.id
      WHERE p.id = $1 AND p.deleted_at IS NULL
      GROUP BY p.id, m.id, m.name, m.role, tc.total, tc.completed
      `,
      [project.id]
    );

    return res.status(201).json({
      success: true,
      message: 'Project created successfully.',
      project: mapProjectRow(detailRes.rows[0]),
    });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /api/projects error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to create project.' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/projects
 * Lists all projects with calculated progress.
 * PM: all active projects.
 * TL/TM/TESTER: only projects where they are manager or team members.
 */
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    const { search, status, teamLeader } = req.query;

    let query = `
      SELECT
        p.id, p.title, p.name, p.description,
        to_char(p.start_date, 'YYYY-MM-DD') AS start_date,
        to_char(p.deadline, 'YYYY-MM-DD') AS deadline,
        p.status,
        p.priority, p.progress, p.team_leader_id,
        m.id AS manager_id, m.name AS manager_name, m.role AS manager_role,
        COALESCE(tc.total, 0) AS tasks_total,
        COALESCE(tc.completed, 0) AS tasks_completed,
        COALESCE(array_agg(DISTINCT ptm.user_id) FILTER (WHERE ptm.user_id IS NOT NULL), ARRAY[]::BIGINT[]) AS team_member_ids
      FROM projects p
      LEFT JOIN users m ON p.manager_id = m.id
      LEFT JOIN project_team_members ptm ON ptm.project_id = p.id
      LEFT JOIN (
        SELECT project_id,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status = 'DONE') AS completed
        FROM tasks
        GROUP BY project_id
      ) tc ON tc.project_id = p.id
      WHERE p.deleted_at IS NULL
    `;
    const params: any[] = [];

    if (userRole !== 'PM') {
      query += ` AND (p.manager_id = $${params.length + 1} OR p.team_leader_id = $${params.length + 1} OR ptm.user_id = $${params.length + 1})`;
      params.push(userId);
    }

    if (search && typeof search === 'string' && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (LOWER(p.title) LIKE $${params.length} OR LOWER(p.description) LIKE $${params.length})`;
    }

    if (status && typeof status === 'string' && status.trim() && status.toUpperCase() !== 'ALL') {
      params.push(status.trim());
      query += ` AND (UPPER(p.status) = $${params.length} OR UPPER(p.status) = $${params.length + 1})`;
      params.push(
        status.trim().toUpperCase(),
        status
          .split(/[\s._-]+/)
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
          .join(' ')
      );
    }

    if (teamLeader && typeof teamLeader === 'string' && teamLeader.trim()) {
      params.push(Number(teamLeader.trim()));
      query += ` AND p.team_leader_id = $${params.length}`;
    }

    query += ` GROUP BY p.id, m.id, m.name, m.role, tc.total, tc.completed ORDER BY p.id DESC`;

    const result = await pool.query(query, params);
    const projects = result.rows.map(mapProjectRow);

    return res.status(200).json({ success: true, count: projects.length, projects });
  } catch (err: any) {
    console.error('GET /api/projects error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to retrieve projects.' });
  }
});

/**
 * GET /api/projects/:id
 * Returns project details with team and task counts.
 * Access: PM (any active project), or TL/TM/TESTER who is manager or team member.
 */
/**
 * GET /api/projects/:projectId/github/repositories
 * Lists GitHub repositories connected to the specified project.
 * Access: PM (any active project), or TL/TM/TESTER who is manager or team member.
 * Returns non-sensitive repository metadata only (no installation tokens).
 */
router.get(
  '/:projectId/github/repositories',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const client = await pool.connect();
    try {
      const userId = req.user?.id;
      const userRole = (req.user?.role || '').toUpperCase();
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required.' });
      }

      const projectId = Number(req.params.projectId);
      if (!projectId || isNaN(projectId)) {
        return res.status(400).json({ success: false, error: 'Invalid project ID.' });
      }

      const hasAccess = await checkProjectAccess(client, projectId, userId, userRole);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: You do not have access to this project.',
        });
      }

      const res2 = await client.query(
        `SELECT
           pgr.github_repo_id,
           pgr.github_repo_full_name,
           pgr.installation_id,
           pgr.connected_at,
           pgr.is_active,
           pgr.auto_sync_enabled,
           gr.name,
           gr.owner_login,
           gr.private,
           gr.default_branch,
           gr.html_url,
           gr.description,
           gr.archived,
           gr.github_updated_at
         FROM project_github_repositories pgr
         LEFT JOIN github_repositories gr
           ON gr.installation_id = pgr.installation_id
          AND gr.github_repo_id = pgr.github_repo_id
         WHERE pgr.project_id = $1
           AND pgr.is_active = TRUE
         ORDER BY pgr.connected_at DESC`,
        [projectId]
      );

      return res.status(200).json({
        success: true,
        count: res2.rows.length,
        repositories: res2.rows.map((row: any) => ({
          githubRepoId: row.github_repo_id,
          fullName: row.github_repo_full_name || row.name,
          name: row.name,
          ownerLogin: row.owner_login,
          private: row.private,
          defaultBranch: row.default_branch,
          htmlUrl: row.html_url,
          description: row.description,
          archived: row.archived,
          githubUpdatedAt: row.github_updated_at,
          installationId: row.installation_id,
          connectedAt: row.connected_at,
          isActive: row.is_active,
          autoSyncEnabled: row.auto_sync_enabled,
        })),
      });
    } catch (err: any) {
      console.error('GET /api/projects/:projectId/github/repositories error:', err.message);
      return res.status(500).json({ success: false, error: 'Failed to list connected repositories.' });
    } finally {
      client.release();
    }
  }
);

/**
 * POST /api/projects/:projectId/github/repositories/connect
 * Connects a GitHub repository to the specified project. PM only.
 */
router.post(
  '/:projectId/github/repositories/connect',
  authenticateToken,
  requirePM,
  async (req: AuthenticatedRequest, res: Response) => {
    const client = await pool.connect();
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required.' });
      }

      const projectId = Number(req.params.projectId);
      if (!projectId || isNaN(projectId)) {
        return res.status(400).json({ success: false, error: 'Invalid project ID.' });
      }

      const { githubRepoId } = req.body || {};
      const repoId = Number(githubRepoId);
      if (!repoId || isNaN(repoId)) {
        return res.status(400).json({ success: false, error: 'Valid githubRepoId is required.' });
      }

      // Verify the PM manages this project
      const isOwner = await checkProjectOwnership(client, projectId, userId);
      if (!isOwner) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: Only the project manager can connect repositories.',
        });
      }

      // Verify the repository exists in github_repositories and its installation is active
      const repoRes = await client.query(
        `SELECT
           gr.github_repo_id,
           gr.name,
           gr.full_name,
           gr.installation_id,
           gi.is_active AS installation_active
         FROM github_repositories gr
         JOIN github_installations gi
           ON gi.installation_id = gr.installation_id
         WHERE gr.github_repo_id = $1`,
        [repoId]
      );

      if (repoRes.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'GitHub repository not found. Ensure the repository has been synchronized to this installation.',
        });
      }

      const repoRow = repoRes.rows[0];
      if (!repoRow.installation_active) {
        return res.status(400).json({
          success: false,
          error: 'The GitHub installation for this repository is not active.',
        });
      }

      // Attempt to insert or reactivate the connection.
      // The partial unique index uq_github_repo_project_active (github_repo_id WHERE is_active = TRUE)
      // prevents the same repository from being actively connected to another project.
      // The partial unique index uq_project_github_repo_active (project_id, github_repo_id WHERE is_active = TRUE)
      // prevents duplicate active connections for the same project+repo pair.
      const insertRes = await client.query(
        `INSERT INTO project_github_repositories (
           project_id, github_repo_id, github_repo_full_name, installation_id,
           connected_by, connected_at, is_active, auto_sync_enabled
         ) VALUES (
           $1, $2::bigint, $3, $4::bigint, $5::bigint, NOW(), TRUE, TRUE
         )
         ON CONFLICT (github_repo_id) WHERE is_active = TRUE DO NOTHING
         RETURNING id, is_active`,
        [projectId, repoId, repoRow.full_name, repoRow.installation_id, userId]
      );

      if (insertRes.rows.length === 0) {
        // Conflict: repository is already actively connected to another project
        const existing = await client.query(
          `SELECT project_id FROM project_github_repositories
           WHERE github_repo_id = $2::bigint AND is_active = TRUE
           LIMIT 1`,
          [projectId, repoId]
        );
        if (existing.rows.length > 0) {
          return res.status(409).json({
            success: false,
            error: `This repository is already connected to project ${existing.rows[0].project_id}.`,
          });
        }
        return res.status(409).json({
          success: false,
          error: 'This repository is already connected to another project.',
        });
      }

      // Check if we reactivated a previously disconnected record
      const wasReactivated = insertRes.rows[0].is_active === true;
      // If the row existed before with is_active=FALSE, ON CONFLICT DO NOTHING wouldn't have
      // triggered because the partial index only covers is_active=TRUE rows.
      // So we need to check if there was an inactive record we should have reactivated.
      // Actually: ON CONFLICT on partial index only triggers when the conflicting row
      // satisfies the WHERE clause. If the only existing row has is_active=FALSE,
      // the INSERT succeeds (no conflict on the partial index).
      // But we already set is_active=TRUE in the INSERT, so it's already active.
      // However, if there was a previous disconnected record for THIS project+repo,
      // we should update it instead of inserting a new one.
      // Let's check: did we insert a new row or update an existing inactive one?
      // Since ON CONFLICT DO NOTHING doesn't update, we need to handle reactivation separately.
      // Check if there's an inactive record for this project+repo
      const inactiveRes = await client.query(
        `SELECT id FROM project_github_repositories
         WHERE project_id = $1 AND github_repo_id = $2::bigint AND is_active = FALSE
         LIMIT 1`,
        [projectId, repoId]
      );

      if (inactiveRes.rows.length > 0) {
        // Reactivate the existing disconnected record
        await client.query(
          `UPDATE project_github_repositories
           SET is_active = TRUE, disconnected_at = NULL, connected_at = NOW(),
               connected_by = $3::bigint, auto_sync_enabled = TRUE
           WHERE id = $1`,
          [inactiveRes.rows[0].id, projectId, repoId, userId]
        );
      }

      return res.status(200).json({
        success: true,
        message: 'Repository connected to project successfully.',
        repository: {
          githubRepoId: repoId,
          fullName: repoRow.full_name,
          name: repoRow.name,
          installationId: repoRow.installation_id,
          connectedAt: new Date().toISOString(),
          isActive: true,
          autoSyncEnabled: true,
        },
      });
    } catch (err: any) {
      // Handle unique constraint violation from the partial unique index
      if (err?.code === '23505') {
        return res.status(409).json({
          success: false,
          error: 'This repository is already connected to another project or this project.',
        });
      }
      console.error('POST /api/projects/:projectId/github/repositories/connect error:', err.message);
      return res.status(500).json({ success: false, error: 'Failed to connect repository.' });
    } finally {
      client.release();
    }
  }
);

/**
 * DELETE /api/projects/:projectId/github/repositories/:githubRepoId/disconnect
 * Disconnects (soft-deletes) a GitHub repository from the specified project. PM only.
 */
router.delete(
  '/:projectId/github/repositories/:githubRepoId/disconnect',
  authenticateToken,
  requirePM,
  async (req: AuthenticatedRequest, res: Response) => {
    const client = await pool.connect();
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required.' });
      }

      const projectId = Number(req.params.projectId);
      if (!projectId || isNaN(projectId)) {
        return res.status(400).json({ success: false, error: 'Invalid project ID.' });
      }

      const githubRepoId = Number(req.params.githubRepoId);
      if (!githubRepoId || isNaN(githubRepoId)) {
        return res.status(400).json({ success: false, error: 'Invalid GitHub repository ID.' });
      }

      // Verify the PM manages this project
      const isOwner = await checkProjectOwnership(client, projectId, userId);
      if (!isOwner) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: Only the project manager can disconnect repositories.',
        });
      }

      // Soft-disconnect: mark as inactive, preserve historical record
      const res2 = await client.query(
        `UPDATE project_github_repositories
         SET is_active = FALSE, disconnected_at = NOW()
         WHERE project_id = $1 AND github_repo_id = $2::bigint AND is_active = TRUE
         RETURNING id, github_repo_id`,
        [projectId, githubRepoId]
      );

      if (res2.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Repository connection not found or already disconnected.',
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Repository disconnected from project.',
        repository: {
          githubRepoId: res2.rows[0].github_repo_id,
          disconnectedAt: new Date().toISOString(),
        },
      });
    } catch (err: any) {
      console.error('DELETE /api/projects/:projectId/github/repositories/:githubRepoId/disconnect error:', err.message);
      return res.status(500).json({ success: false, error: 'Failed to disconnect repository.' });
    } finally {
      client.release();
    }
  }
);

router.get('/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    const projectId = Number(req.params.id);
    if (!projectId || isNaN(projectId)) {
      return res.status(400).json({ success: false, error: 'Invalid project ID.' });
    }

    // Existence check first (active, not soft-deleted)
    const existsRes = await client.query(
      'SELECT 1 FROM projects WHERE id = $1 AND deleted_at IS NULL',
      [projectId]
    );
    if (existsRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Project not found.' });
    }

    const hasAccess = await checkProjectAccess(client, projectId, userId, userRole);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You do not have access to this project.',
      });
    }

    const statusesTableExistsLocal = await taskStatusesTableExists(client);
    if (!statusesTableExistsLocal) {
      // Migration 020 not applied: return default fallback statuses gracefully
      return res.status(200).json({
        success: true,
        count: 4,
        statuses: [
          { id: 'legacy-1', projectId: String(projectId), name: 'Not Started', color: '#3b82f6', sortOrder: 1, isSystem: true, isCompletionStatus: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          { id: 'legacy-2', projectId: String(projectId), name: 'In Progress', color: '#6366f1', sortOrder: 2, isSystem: true, isCompletionStatus: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          { id: 'legacy-3', projectId: String(projectId), name: 'Under Review', color: '#f59e0b', sortOrder: 3, isSystem: true, isCompletionStatus: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          { id: 'legacy-4', projectId: String(projectId), name: 'Completed', color: '#10b981', sortOrder: 4, isSystem: true, isCompletionStatus: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        ],
      });
    }

    const result = await client.query(
      `
      SELECT
        p.id, p.title, p.name, p.description,
        to_char(p.start_date, 'YYYY-MM-DD') AS start_date,
        to_char(p.deadline, 'YYYY-MM-DD') AS deadline,
        p.status,
        p.priority, p.progress, p.team_leader_id,
        m.id AS manager_id, m.name AS manager_name, m.role AS manager_role,
        COALESCE(tc.total, 0) AS tasks_total,
        COALESCE(tc.completed, 0) AS tasks_completed,
        COALESCE(array_agg(DISTINCT ptm.user_id) FILTER (WHERE ptm.user_id IS NOT NULL), ARRAY[]::BIGINT[]) AS team_member_ids
      FROM projects p
      LEFT JOIN users m ON p.manager_id = m.id
      LEFT JOIN project_team_members ptm ON ptm.project_id = p.id
      LEFT JOIN (
        SELECT project_id,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status = 'DONE') AS completed
        FROM tasks
        GROUP BY project_id
      ) tc ON tc.project_id = p.id
      WHERE p.id = $1 AND p.deleted_at IS NULL
      GROUP BY p.id, m.id, m.name, m.role, tc.total, tc.completed
      `,
      [projectId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Project not found.' });
    }

    return res.status(200).json({ success: true, project: mapProjectRow(result.rows[0]) });
  } catch (err: any) {
    console.error('GET /api/projects/:id error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to retrieve project.' });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/projects/:id
 * Updates a project. Only the owning Project Manager can update.
 */
router.patch('/:id', authenticateToken, requirePM, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const managerId = req.user?.id;
    if (!managerId) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    const projectId = Number(req.params.id);
    if (!projectId || isNaN(projectId)) {
      return res.status(400).json({ success: false, error: 'Invalid project ID.' });
    }

    // Existence check first
    const existsRes = await client.query(
      'SELECT 1 FROM projects WHERE id = $1 AND deleted_at IS NULL',
      [projectId]
    );
    if (existsRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Project not found.' });
    }

    const isOwner = await checkProjectOwnership(client, projectId, managerId);
    if (!isOwner) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only the project manager can update this project.',
      });
    }

    const {
      name,
      description,
      startDate,
      deadline,
      status,
      priority,
      teamLeaderId,
      teamMemberIds,
    } = req.body;

    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ success: false, error: 'Project name is required.' });
      }
      const projectName = name.trim();
      updateFields.push(`title = $${paramIndex}`, `name = $${paramIndex + 1}`);
      updateValues.push(projectName, projectName);
      paramIndex += 2;
    }
    if (description !== undefined) {
      updateFields.push(`description = $${paramIndex}`);
      updateValues.push(typeof description === 'string' ? description.trim() : '');
      paramIndex++;
    }
    if (startDate !== undefined) {
      if (startDate && isNaN(new Date(startDate).getTime())) {
        return res.status(400).json({ success: false, error: 'Invalid start date.' });
      }
      updateFields.push(`start_date = $${paramIndex}`);
      updateValues.push(startDate || null);
      paramIndex++;
    }
    if (deadline !== undefined) {
      if (deadline && isNaN(new Date(deadline).getTime())) {
        return res.status(400).json({ success: false, error: 'Invalid deadline.' });
      }
      updateFields.push(`deadline = $${paramIndex}`);
      updateValues.push(deadline || null);
      paramIndex++;
    }
    if (startDate !== undefined && deadline !== undefined && startDate && deadline) {
      if (new Date(deadline) < new Date(startDate)) {
        return res.status(400).json({
          success: false,
          error: 'Deadline cannot be earlier than the start date.',
        });
      }
    }
    if (status !== undefined) {
      updateFields.push(`status = $${paramIndex}`);
      updateValues.push(normalizeProjectStatus(status) || 'Planning');
      paramIndex++;
    }
    if (priority !== undefined) {
      updateFields.push(`priority = $${paramIndex}`);
      updateValues.push(normalizeProjectPriority(priority) || 'Medium');
      paramIndex++;
    }
    if (teamLeaderId !== undefined) {
      const parsedTeamLeaderId =
        teamLeaderId && String(teamLeaderId).trim() ? Number(teamLeaderId) : null;
      if (parsedTeamLeaderId !== null && (isNaN(parsedTeamLeaderId) || parsedTeamLeaderId <= 0)) {
        return res.status(400).json({ success: false, error: 'Invalid team leader ID.' });
      }
      updateFields.push(`team_leader_id = $${paramIndex}`);
      updateValues.push(parsedTeamLeaderId);
      paramIndex++;

      if (parsedTeamLeaderId !== null) {
        const tlCheck = await client.query(
          'SELECT id, role, is_active FROM users WHERE id = $1',
          [parsedTeamLeaderId]
        );
        if (tlCheck.rows.length === 0) {
          return res.status(400).json({ success: false, error: 'Team leader does not exist.' });
        }
        const tl = tlCheck.rows[0];
        if (!tl.is_active) {
          return res.status(400).json({ success: false, error: 'Team leader is not active.' });
        }
        if (tl.role.toUpperCase() !== 'TL') {
          return res.status(400).json({ success: false, error: 'Team leader must have the TL role.' });
        }
      }
    }

    if (updateFields.length === 0 && teamMemberIds === undefined) {
      return res.status(400).json({ success: false, error: 'No fields to update.' });
    }

    if (updateFields.length > 0) {
      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      updateValues.push(projectId);
      const updateQuery = `UPDATE projects SET ${updateFields.join(', ')} WHERE id = $${paramIndex} AND deleted_at IS NULL RETURNING id`;
      await client.query(updateQuery, updateValues);
    }

    await client.query('BEGIN');

    if (teamMemberIds !== undefined) {
      const memberIds: number[] = [];
      if (Array.isArray(teamMemberIds)) {
        for (const id of teamMemberIds) {
          const num = Number(id);
          if (!isNaN(num) && num > 0 && !memberIds.includes(num)) memberIds.push(num);
        }
      }

      const currentTeamLeaderIdResult = await client.query(
        'SELECT team_leader_id FROM projects WHERE id = $1',
        [projectId]
      );
      const currentTeamLeaderId = currentTeamLeaderIdResult.rows[0]?.team_leader_id
        ? Number(currentTeamLeaderIdResult.rows[0].team_leader_id)
        : null;

      const effectiveTeamLeaderId =
        teamLeaderId !== undefined
          ? (teamLeaderId && String(teamLeaderId).trim() ? Number(teamLeaderId) : null)
          : currentTeamLeaderId;

      const allTeamIds: number[] = [];
      if (effectiveTeamLeaderId !== null) allTeamIds.push(effectiveTeamLeaderId);
      for (const id of memberIds) {
        if (!allTeamIds.includes(id)) allTeamIds.push(id);
      }

      if (allTeamIds.length > 0) {
        const validation = await validateTeamMembers(client, effectiveTeamLeaderId, memberIds);
        if (!validation.valid) {
          await client.query('ROLLBACK').catch(() => {});
          return res.status(400).json({ success: false, error: validation.error });
        }

        await client.query(
          `DELETE FROM project_team_members WHERE project_id = $1`,
          [projectId]
        );

        await client.query(
          `INSERT INTO project_team_members (project_id, user_id)
           SELECT $1, unnest($2::BIGINT[])
           ON CONFLICT (project_id, user_id) DO NOTHING`,
          [projectId, allTeamIds]
        );
      } else {
        await client.query(
          `DELETE FROM project_team_members WHERE project_id = $1`,
          [projectId]
        );
      }
    }

    await client.query('COMMIT');

    const detailRes = await pool.query(
      `
      SELECT
        p.id, p.title, p.name, p.description,
        to_char(p.start_date, 'YYYY-MM-DD') AS start_date,
        to_char(p.deadline, 'YYYY-MM-DD') AS deadline,
        p.status,
        p.priority, p.progress, p.team_leader_id,
        m.id AS manager_id, m.name AS manager_name, m.role AS manager_role,
        COALESCE(tc.total, 0) AS tasks_total,
        COALESCE(tc.completed, 0) AS tasks_completed,
        COALESCE(array_agg(DISTINCT ptm.user_id) FILTER (WHERE ptm.user_id IS NOT NULL), ARRAY[]::BIGINT[]) AS team_member_ids
      FROM projects p
      LEFT JOIN users m ON p.manager_id = m.id
      LEFT JOIN project_team_members ptm ON ptm.project_id = p.id
      LEFT JOIN (
        SELECT project_id,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status = 'DONE') AS completed
        FROM tasks
        GROUP BY project_id
      ) tc ON tc.project_id = p.id
      WHERE p.id = $1 AND p.deleted_at IS NULL
      GROUP BY p.id, m.id, m.name, m.role, tc.total, tc.completed
      `,
      [projectId]
    );

    if (detailRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Project not found.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Project updated successfully.',
      project: mapProjectRow(detailRes.rows[0]),
    });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('PATCH /api/projects/:id error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to update project.' });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/projects/:id
 * Soft-deletes a project. Only the owning Project Manager can soft-delete.
 * Sets deleted_at = NOW(); never physically deletes.
 */
router.delete('/:id', authenticateToken, requirePM, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const managerId = req.user?.id;
    if (!managerId) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    const projectId = Number(req.params.id);
    if (!projectId || isNaN(projectId)) {
      return res.status(400).json({ success: false, error: 'Invalid project ID.' });
    }

    // Existence check first
    const existsRes = await client.query(
      'SELECT 1 FROM projects WHERE id = $1 AND deleted_at IS NULL',
      [projectId]
    );
    if (existsRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Project not found.' });
    }

    const isOwner = await checkProjectOwnership(client, projectId, managerId);
    if (!isOwner) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only the project manager can delete this project.',
      });
    }

    const result = await client.query(
      `UPDATE projects SET deleted_at = NOW(), updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND manager_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [projectId, managerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Project not found.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Project soft-deleted successfully.',
    });
  } catch (err: any) {
    console.error('DELETE /api/projects/:id error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to delete project.' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/projects/:id/tasks
 * Returns tasks for a project. Access rules same as project access.
 * Read-only; no create/update/delete.
 */
router.get('/:id/tasks', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    const projectId = Number(req.params.id);
    if (!projectId || isNaN(projectId)) {
      return res.status(400).json({ success: false, error: 'Invalid project ID.' });
    }

    const existsRes = await client.query(
      'SELECT 1 FROM projects WHERE id = $1 AND deleted_at IS NULL',
      [projectId]
    );
    if (existsRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Project not found.' });
    }

    const hasAccess = await checkProjectAccess(client, projectId, userId, userRole);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You do not have access to this project.',
      });
    }

    const statusesTableExistsLocal = await taskStatusesTableExists(client);
    const statusIdSelect = statusesTableExistsLocal ? 't.status_id,' : '';

    const result = await client.query(
      `
      SELECT
        t.id,
        t.project_id,
        t.title,
        t.description,
        t.status,
        ${statusIdSelect}
        t.priority,
        t.assigned_to_id,
        u.name AS assigned_to_name,
        to_char(COALESCE(t.deadline, t.due_date), 'YYYY-MM-DD') AS deadline,
        t.created_at
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assigned_to_id
      WHERE t.project_id = $1 AND t.deleted_at IS NULL
        AND ($2 = 'TM' AND t.assigned_to_id = $3 OR $2 <> 'TM')
      ORDER BY t.id ASC
      `,
      [projectId, userRole, userId]
    );

    const statusMap: Record<string, string> = {
      TODO: 'Not Started',
      IN_PROGRESS: 'In Progress',
      REVIEW: 'Under Review',
      DONE: 'Completed',
    };
    const priorityMap: Record<string, string> = {
      LOW: 'Low',
      MEDIUM: 'Medium',
      HIGH: 'High',
      URGENT: 'Urgent',
    };

    const tasks = result.rows.map((r: any) => ({
      id: String(r.id),
      projectId: String(r.project_id),
      title: r.title,
      description: r.description || '',
      status: statusMap[String(r.status || '').toUpperCase()] || 'Not Started',
      statusId: r.status_id ? String(r.status_id) : null,
      priority: priorityMap[String(r.priority || '').toUpperCase()] || 'Medium',
      assignedToId: r.assigned_to_id ? String(r.assigned_to_id) : null,
      assignedTo: r.assigned_to_name || null,
      deadline: r.deadline ? String(r.deadline).slice(0, 10) : null,
      createdAt: r.created_at,
    }));

    return res.status(200).json({
      success: true,
      count: tasks.length,
      tasks,
    });
  } catch (err: any) {
    console.error('GET /api/projects/:id/tasks error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to retrieve tasks.' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/projects/:id/tasks
 * Creates a task in a project. PM and TL only.
 */
router.post('/:id/tasks', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    if (userRole !== 'PM' && userRole !== 'TL') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only Project Managers and Team Leaders can create tasks.',
      });
    }

    const projectId = Number(req.params.id);
    if (!projectId || isNaN(projectId)) {
      return res.status(400).json({ success: false, error: 'Invalid project ID.' });
    }

    const existsRes = await client.query(
      'SELECT 1 FROM projects WHERE id = $1 AND deleted_at IS NULL',
      [projectId]
    );
    if (existsRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Project not found.' });
    }

    const hasAccess = await checkProjectAccess(client, projectId, userId, userRole);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You do not have permission to create tasks in this project.',
      });
    }

    const { title, description, assignedToId, priority, deadline, status, statusId } = req.body || {};

    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Task title is required.' });
    }

    // Priority mapping
    const priorityMap: Record<string, string> = {
      LOW: 'LOW',
      MEDIUM: 'MEDIUM',
      HIGH: 'HIGH',
      URGENT: 'URGENT',
      Low: 'LOW',
      Medium: 'MEDIUM',
      High: 'HIGH',
      Urgent: 'URGENT',
    };
    const dbPriority =
      priority !== undefined && priority !== null
        ? priorityMap[String(priority).trim()] || priorityMap[String(priority).trim().toUpperCase()]
        : 'MEDIUM';
    if (!['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(dbPriority)) {
      return res.status(400).json({ success: false, error: 'Invalid priority value.' });
    }

    // Validate assigned user
    let assignedUserId: number | null = null;
    if (assignedToId !== undefined && assignedToId !== null && String(assignedToId).trim() !== '') {
      const num = Number(assignedToId);
      if (isNaN(num) || num <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid assigned user ID.' });
      }
      // exists, active, eligible project team member (or project manager)
      const userRes = await client.query(
        'SELECT id, is_active FROM users WHERE id = $1',
        [num]
      );
      if (userRes.rows.length === 0) {
        return res.status(400).json({ success: false, error: 'Assigned user does not exist.' });
      }
      if (!userRes.rows[0].is_active) {
        return res.status(400).json({ success: false, error: 'Assigned user is not active.' });
      }
      // eligible: project manager or project team member
      const membershipRes = await client.query(
        `SELECT 1 FROM projects p
         LEFT JOIN project_team_members ptm ON ptm.project_id = p.id AND ptm.user_id = $2
         WHERE p.id = $1 AND p.deleted_at IS NULL AND (p.manager_id = $2 OR ptm.user_id IS NOT NULL)`,
        [projectId, num]
      );
      if (membershipRes.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Assigned user is not an eligible project team member.',
        });
      }
      assignedUserId = num;
    }

    // Deadline
    let deadlineVal: string | null = null;
    if (deadline !== undefined && deadline !== null && String(deadline).trim() !== '') {
      deadlineVal = String(deadline).trim();
    }

    // Look up the 'Not Started' status for this project
    // Skips gracefully if migration 020 has not yet been applied.
    let targetStatusName = 'Not Started';
    let targetStatusId: number | null = null;
    const statusesTableExistsLocal = await taskStatusesTableExists(client);

    if (statusesTableExistsLocal) {
      if (statusId) {
        const sRes = await client.query(
          'SELECT id, name FROM task_statuses WHERE project_id = $1 AND id = $2 LIMIT 1',
          [projectId, Number(statusId)]
        );
        if (sRes.rows.length > 0) {
          targetStatusId = sRes.rows[0].id;
          targetStatusName = sRes.rows[0].name;
        }
      }
      if (!targetStatusId && status) {
        const sRes = await client.query(
          'SELECT id, name FROM task_statuses WHERE project_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2)) LIMIT 1',
          [projectId, String(status)]
        );
        if (sRes.rows.length > 0) {
          targetStatusId = sRes.rows[0].id;
          targetStatusName = sRes.rows[0].name;
        }
      }
      if (!targetStatusId) {
        const defaultStatusRes = await client.query(
          `SELECT id, name FROM task_statuses WHERE project_id = $1 
           ORDER BY CASE WHEN LOWER(name) = 'not started' THEN 0 ELSE 1 END, sort_order ASC, id ASC LIMIT 1`,
          [projectId]
        );
        if (defaultStatusRes.rows.length > 0) {
          targetStatusId = defaultStatusRes.rows[0].id;
          targetStatusName = defaultStatusRes.rows[0].name;
        }
      }
    } else {
      console.warn(
        `⚠️ Migration 020 not applied: task_statuses table missing. Task will be created without status_id.`
      );
    }

    // Get project_key and increment task_counter (task keys implementation)
    const projectUpdateRes = await client.query(
      'UPDATE projects SET task_counter = task_counter + 1 WHERE id = $1 RETURNING task_counter, project_key',
      [projectId]
    );
    const projectKey = projectUpdateRes.rows[0].project_key;
    const taskNumber = projectUpdateRes.rows[0].task_counter;
    const taskKey = `${projectKey}-${taskNumber}`;

    const legacyMap: Record<string, string> = {
      'Not Started': 'TODO',
      'In Progress': 'IN_PROGRESS',
      'Under Review': 'REVIEW',
      'Completed': 'DONE',
      'Seen': 'SEEN',
      'On Hold': 'ON_HOLD',
      'Changes Requested': 'CHANGES_REQUESTED',
      'Bug Fix Required': 'BUG_FIX_REQUIRED',
      'Ready for Approval': 'READY_FOR_APPROVAL',
    };
    const dbStatus = legacyMap[targetStatusName] || 'TODO';

    const insertRes = await client.query(
      `INSERT INTO tasks (project_id, title, description, status, status_id, priority, assigned_to_id, deadline, due_date, created_at, task_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, CURRENT_TIMESTAMP, $9)
       RETURNING id, project_id, title, description, status, status_id, priority, assigned_to_id, deadline, due_date, created_at`,
      [projectId, title.trim(), description ? String(description) : null, dbStatus, targetStatusId, dbPriority, assignedUserId, deadlineVal, taskNumber]
    );

    const row = insertRes.rows[0];
    const statusMap: Record<string, string> = {
      TODO: 'Not Started',
      IN_PROGRESS: 'In Progress',
      REVIEW: 'Under Review',
      DONE: 'Completed',
    };
    const priorityDisplayMap: Record<string, string> = {
      LOW: 'Low',
      MEDIUM: 'Medium',
      HIGH: 'High',
      URGENT: 'Urgent',
    };

    const createdTask = {
      id: String(row.id),
      projectId: String(row.project_id),
      title: row.title,
      description: row.description || '',
      status: targetStatusName || statusMap[String(row.status || '').toUpperCase()] || row.status || 'Not Started',
      statusId: row.status_id ? String(row.status_id) : null,
      priority: priorityDisplayMap[String(row.priority || '').toUpperCase()] || 'Medium',
      assignedToId: row.assigned_to_id ? String(row.assigned_to_id) : null,
      deadline: row.deadline ? (row.deadline instanceof Date ? row.deadline.toISOString().slice(0,10) : String(row.deadline).slice(0,10)) : (row.due_date ? (row.due_date instanceof Date ? row.due_date.toISOString().slice(0,10) : String(row.due_date).slice(0,10)) : null),
      createdAt: row.created_at,
      taskNumber: taskNumber,
      taskKey: taskKey,
    };

    return res.status(201).json({
      success: true,
      message: 'Task created successfully.',
      task: createdTask,
    });
  } catch (err: any) {
    console.error('POST /api/projects/:id/tasks error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to create task.' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/projects/:id/team
 * Returns project team members.
 * Access: PM (any active project), or TL/TM/TESTER who is manager or team member.
 */
router.get('/:id/team', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    const projectId = Number(req.params.id);
    if (!projectId || isNaN(projectId)) {
      return res.status(400).json({ success: false, error: 'Invalid project ID.' });
    }

    // Existence check first
    const existsRes = await client.query(
      'SELECT 1 FROM projects WHERE id = $1 AND deleted_at IS NULL',
      [projectId]
    );
    if (existsRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Project not found.' });
    }

    const hasAccess = await checkProjectAccess(client, projectId, userId, userRole);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You do not have access to this project.',
      });
    }

    const result = await client.query(
      `
      SELECT
        u.id, u.name, u.email, u.role, u.team, u.is_active, u.skills,
        ptm.created_at AS assigned_at,
        (p.team_leader_id = u.id) AS is_team_leader
      FROM project_team_members ptm
      JOIN users u ON u.id = ptm.user_id
      JOIN projects p ON p.id = ptm.project_id
      WHERE ptm.project_id = $1 AND p.deleted_at IS NULL
      ORDER BY (p.team_leader_id = u.id) DESC, u.name ASC
      `,
      [projectId]
    );

    const teamMembers = result.rows.map((u: any) => ({
      id: String(u.id),
      name: u.name,
      email: u.email,
      role: u.role,
      team: u.team || 'General',
      skills: u.skills ? String(u.skills).split(',').map((x: string) => x.trim()).filter(Boolean) : [],
      isActive: Boolean(u.is_active),
      isTeamLeader: Boolean(u.is_team_leader),
      assignedAt: u.assigned_at,
    }));

    return res.status(200).json({ success: true, count: teamMembers.length, teamMembers });
  } catch (err: any) {
    console.error('GET /api/projects/:id/team error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to retrieve project team.' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/projects/:id/team
 * Adds team members to a project. Only the owning Project Manager can manage the team.
 */
router.post('/:id/team', authenticateToken, requirePM, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const managerId = req.user?.id;
    if (!managerId) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    const projectId = Number(req.params.id);
    if (!projectId || isNaN(projectId)) {
      return res.status(400).json({ success: false, error: 'Invalid project ID.' });
    }

    // Existence check first
    const existsRes = await client.query(
      'SELECT 1 FROM projects WHERE id = $1 AND deleted_at IS NULL',
      [projectId]
    );
    if (existsRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Project not found.' });
    }

    const isOwner = await checkProjectOwnership(client, projectId, managerId);
    if (!isOwner) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only the project manager can manage this project team.',
      });
    }

    const { userIds, teamLeaderId } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ success: false, error: 'userIds array is required.' });
    }

    const memberIds: number[] = [];
    for (const id of userIds) {
      const num = Number(id);
      if (!isNaN(num) && num > 0 && !memberIds.includes(num)) memberIds.push(num);
    }

    if (memberIds.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid user IDs provided.' });
    }

    const parsedTeamLeaderId =
      teamLeaderId && String(teamLeaderId).trim() ? Number(teamLeaderId) : null;
    if (parsedTeamLeaderId !== null && (isNaN(parsedTeamLeaderId) || parsedTeamLeaderId <= 0)) {
      return res.status(400).json({ success: false, error: 'Invalid team leader ID.' });
    }

    const allTeamIds: number[] = [];
    if (parsedTeamLeaderId !== null) allTeamIds.push(parsedTeamLeaderId);
    for (const id of memberIds) {
      if (!allTeamIds.includes(id)) allTeamIds.push(id);
    }

    const validation = await validateTeamMembers(client, parsedTeamLeaderId, memberIds);
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    await client.query('BEGIN');

    if (parsedTeamLeaderId !== null) {
      await client.query(
        `UPDATE projects SET team_leader_id = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND manager_id = $3 AND deleted_at IS NULL`,
        [parsedTeamLeaderId, projectId, managerId]
      );
    }

    await client.query(
      `INSERT INTO project_team_members (project_id, user_id)
       SELECT $1, unnest($2::BIGINT[])
       ON CONFLICT (project_id, user_id) DO NOTHING`,
      [projectId, allTeamIds]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Project team members added successfully.',
    });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /api/projects/:id/team error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to update project team.' });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/projects/:id/team/:userId
 * Removes a team member from a project. Only the owning Project Manager can manage the team.
 */
router.delete('/:id/team/:userId', authenticateToken, requirePM, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const managerId = req.user?.id;
    if (!managerId) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    const projectId = Number(req.params.id);
    const userIdToRemove = Number(req.params.userId);
    if (!projectId || isNaN(projectId)) {
      return res.status(400).json({ success: false, error: 'Invalid project ID.' });
    }
    if (!userIdToRemove || isNaN(userIdToRemove)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID.' });
    }

    // Existence check first
    const existsRes = await client.query(
      'SELECT 1 FROM projects WHERE id = $1 AND deleted_at IS NULL',
      [projectId]
    );
    if (existsRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Project not found.' });
    }

    const isOwner = await checkProjectOwnership(client, projectId, managerId);
    if (!isOwner) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only the project manager can manage this project team.',
      });
    }

    const isProjectManager = await client.query(
      'SELECT 1 FROM projects WHERE id = $1 AND manager_id = $2 AND deleted_at IS NULL',
      [projectId, userIdToRemove]
    );
    if (isProjectManager.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot remove the project manager from the team.',
      });
    }

    await client.query('BEGIN');

    await client.query(
      `DELETE FROM project_team_members WHERE project_id = $1 AND user_id = $2`,
      [projectId, userIdToRemove]
    );

    const currentTL = await client.query(
      'SELECT team_leader_id FROM projects WHERE id = $1',
      [projectId]
    );
    if (currentTL.rows[0]?.team_leader_id && Number(currentTL.rows[0].team_leader_id) === userIdToRemove) {
      await client.query(
        `UPDATE projects SET team_leader_id = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [projectId]
      );
    }

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Team member removed successfully.',
    });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('DELETE /api/projects/:id/team/:userId error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to remove team member.' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/projects/:id/statuses
 * List task statuses for a project. Access: PM/TL/TM/Tester with project access.
 */
router.get('/:id/statuses', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    const projectId = Number(req.params.id);
    if (!projectId || isNaN(projectId)) {
      return res.status(400).json({ success: false, error: 'Invalid project ID.' });
    }

    const existsRes = await client.query(
      'SELECT 1 FROM projects WHERE id = $1 AND deleted_at IS NULL',
      [projectId]
    );
    if (existsRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Project not found.' });
    }

    const hasAccess = await checkProjectAccess(client, projectId, userId, userRole);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You do not have access to this project.',
      });
    }

    const result = await client.query(
      `SELECT id, name, color, sort_order, is_system, is_completion_status, created_at, updated_at
       FROM task_statuses
       WHERE project_id = $1
       ORDER BY sort_order ASC, name ASC`,
      [projectId]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      statuses: result.rows.map((r: any) => ({
        id: String(r.id),
        projectId: String(projectId),
        name: r.name,
        color: r.color,
        sortOrder: r.sort_order,
        isSystem: r.is_system,
        isCompletionStatus: r.is_completion_status,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err: any) {
    console.error('GET /api/projects/:id/statuses error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to retrieve project statuses.' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/projects/:id/statuses
 * Create a new task status for a project. Access: PM/TL/TM/Tester with project access.
 */
router.post('/:id/statuses', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    const projectId = Number(req.params.id);
    if (!projectId || isNaN(projectId)) {
      return res.status(400).json({ success: false, error: 'Invalid project ID.' });
    }

    const existsRes = await client.query(
      'SELECT 1 FROM projects WHERE id = $1 AND deleted_at IS NULL',
      [projectId]
    );
    if (existsRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Project not found.' });
    }

    const hasAccess = await checkProjectAccess(client, projectId, userId, userRole);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You do not have access to this project.',
      });
    }

    const statusesTableExistsLocal = await taskStatusesTableExists(client);
    if (!statusesTableExistsLocal) {
      return res.status(501).json({
        success: false,
        error: 'Migration 020 not applied: task_statuses table does not exist. Run migration 020 before adding statuses.',
      });
    }

    const { name, color, sortOrder } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Status name is required.' });
    }

    const statusName = name.trim();
    if (statusName.length > 100) {
      return res.status(400).json({ success: false, error: 'Status name must not exceed 100 characters.' });
    }

    const statusSortOrder = sortOrder !== undefined ? Number(sortOrder) : 0;
    if (isNaN(statusSortOrder)) {
      return res.status(400).json({ success: false, error: 'Invalid sort order.' });
    }

    const result = await client.query(
      `INSERT INTO task_statuses (project_id, name, color, sort_order, is_system, is_completion_status)
       VALUES ($1, $2, $3, $4, FALSE, FALSE)
       RETURNING id, name, color, sort_order, is_system, is_completion_status, created_at, updated_at`,
      [projectId, statusName, color || null, statusSortOrder]
    );

    const newStatus = result.rows[0];

    return res.status(201).json({
      success: true,
      message: 'Task status created successfully.',
      status: {
        id: String(newStatus.id),
        projectId: String(projectId),
        name: newStatus.name,
        color: newStatus.color,
        sortOrder: newStatus.sort_order,
        isSystem: newStatus.is_system,
        isCompletionStatus: newStatus.is_completion_status,
        createdAt: newStatus.created_at,
        updatedAt: newStatus.updated_at,
      },
    });
  } catch (err: any) {
    console.error('POST /api/projects/:id/statuses error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to create task status.' });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/projects/:id/statuses/:statusId
 * Update a task status (rename/recolor/reorder). Access: PM/TL/TM/Tester with project access.
 */
router.patch('/:id/statuses/:statusId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    const projectId = Number(req.params.id);
    const statusId = Number(req.params.statusId);
    if (!projectId || isNaN(projectId)) {
      return res.status(400).json({ success: false, error: 'Invalid project ID.' });
    }
    if (!statusId || isNaN(statusId)) {
      return res.status(400).json({ success: false, error: 'Invalid status ID.' });
    }

    const existsRes = await client.query(
      'SELECT 1 FROM projects WHERE id = $1 AND deleted_at IS NULL',
      [projectId]
    );
    if (existsRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Project not found.' });
    }

    const hasAccess = await checkProjectAccess(client, projectId, userId, userRole);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You do not have access to this project.',
      });
    }

    const statusRes = await client.query(
      'SELECT id, name FROM task_statuses WHERE id = $1 AND project_id = $2',
      [statusId, projectId]
    );
    if (statusRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Status not found.' });
    }

    const { name, color, sortOrder } = req.body || {};
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ success: false, error: 'Status name is required.' });
      }
      const statusName = name.trim();
      if (statusName.length > 100) {
        return res.status(400).json({ success: false, error: 'Status name must not exceed 100 characters.' });
      }
      updateFields.push(`name = $${paramIndex}`);
      updateValues.push(statusName);
      paramIndex++;
    }

    if (color !== undefined) {
      updateFields.push(`color = $${paramIndex}`);
      updateValues.push(color || null);
      paramIndex++;
    }

    if (sortOrder !== undefined) {
      const sortOrderNum = Number(sortOrder);
      if (isNaN(sortOrderNum)) {
        return res.status(400).json({ success: false, error: 'Invalid sort order.' });
      }
      updateFields.push(`sort_order = $${paramIndex}`);
      updateValues.push(sortOrderNum);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update.' });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    updateValues.push(statusId);

    const result = await client.query(
      `UPDATE task_statuses SET ${updateFields.join(', ')}
       WHERE id = $${paramIndex} AND project_id = $${paramIndex + 1}
       RETURNING id, name, color, sort_order, is_system, is_completion_status, created_at, updated_at`,
      [...updateValues, statusId, projectId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Status not found.' });
    }

    const updatedStatus = result.rows[0];

    return res.status(200).json({
      success: true,
      message: 'Task status updated successfully.',
      status: {
        id: String(updatedStatus.id),
        projectId: String(projectId),
        name: updatedStatus.name,
        color: updatedStatus.color,
        sortOrder: updatedStatus.sort_order,
        isSystem: updatedStatus.is_system,
        isCompletionStatus: updatedStatus.is_completion_status,
        createdAt: updatedStatus.created_at,
        updatedAt: updatedStatus.updated_at,
      },
    });
  } catch (err: any) {
    console.error('PATCH /api/projects/:id/statuses/:statusId error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to update task status.' });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/projects/:id/statuses/:statusId
 * Remove a task status. Access: PM/TL/TM/Tester with project access.
 * If status has tasks, requires replacementStatusId in body.
 */
router.delete('/:id/statuses/:statusId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    const projectId = Number(req.params.id);
    const statusId = Number(req.params.statusId);
    if (!projectId || isNaN(projectId)) {
      return res.status(400).json({ success: false, error: 'Invalid project ID.' });
    }
    if (!statusId || isNaN(statusId)) {
      return res.status(400).json({ success: false, error: 'Invalid status ID.' });
    }

    const existsRes = await client.query(
      'SELECT 1 FROM projects WHERE id = $1 AND deleted_at IS NULL',
      [projectId]
    );
    if (existsRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Project not found.' });
    }

    const hasAccess = await checkProjectAccess(client, projectId, userId, userRole);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You do not have access to this project.',
      });
    }

    const statusesTableExistsLocal = await taskStatusesTableExists(client);
    if (!statusesTableExistsLocal) {
      return res.status(501).json({
        success: false,
        error: 'Migration 020 not applied: task_statuses table does not exist. Cannot delete statuses.',
      });
    }

    const statusRes = await client.query(
      'SELECT id, name, is_completion_status FROM task_statuses WHERE id = $1 AND project_id = $2',
      [statusId, projectId]
    );
    if (statusRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Status not found.' });
    }

    const status = statusRes.rows[0];

    // Cannot remove the completion status
    if (status.is_completion_status) {
      return res.status(400).json({
        success: false,
        error: 'Cannot remove the completion status. Designate another status as completion first.',
      });
    }

    // Count tasks using this status
    const taskCountRes = await client.query(
      'SELECT COUNT(*) AS cnt FROM tasks WHERE project_id = $1 AND status_id = $2 AND deleted_at IS NULL',
      [projectId, statusId]
    );
    const taskCount = Number(taskCountRes.rows[0].cnt);

    if (taskCount > 0) {
      const { replacementStatusId } = req.body || {};
      if (!replacementStatusId || isNaN(Number(replacementStatusId))) {
        return res.status(400).json({
          success: false,
          error: `Status '${status.name}' is used by ${taskCount} task(s). A replacement status ID is required.`,
        });
      }

      const replacementId = Number(replacementStatusId);
      if (replacementId === statusId) {
        return res.status(400).json({
          success: false,
          error: 'Replacement status must be different from the status being removed.',
        });
      }

      const replacementRes = await client.query(
        'SELECT id FROM task_statuses WHERE id = $1 AND project_id = $2',
        [replacementId, projectId]
      );
      if (replacementRes.rows.length === 0) {
        return res.status(400).json({ success: false, error: 'Replacement status not found.' });
      }

      await client.query('BEGIN');

      // Reassign tasks to replacement status
      await client.query(
        `UPDATE tasks SET status_id = $1, status = (SELECT name FROM task_statuses WHERE id = $1)
         WHERE project_id = $2 AND status_id = $3 AND deleted_at IS NULL`,
        [replacementId, projectId, statusId]
      );

      // Delete the old status
      await client.query(
        'DELETE FROM task_statuses WHERE id = $1 AND project_id = $2',
        [statusId, projectId]
      );

      await client.query('COMMIT');

      return res.status(200).json({
        success: true,
        message: `Status '${status.name}' removed. ${taskCount} task(s) reassigned to replacement status.`,
      });
    } else {
      // No tasks use this status - safe to delete
      await client.query(
        'DELETE FROM task_statuses WHERE id = $1 AND project_id = $2',
        [statusId, projectId]
      );

      return res.status(200).json({
        success: true,
        message: `Status '${status.name}' removed successfully.`,
      });
    }
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('DELETE /api/projects/:id/statuses/:statusId error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to remove task status.' });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/projects/:id/statuses/:statusId/completion
 * Designate or remove completion status. Access: PM/TL with project access.
 */
router.patch('/:id/statuses/:statusId/completion', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || '').toUpperCase();
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    if (userRole !== 'PM' && userRole !== 'TL') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only Project Managers and Team Leaders can designate completion status.',
      });
    }

    const projectId = Number(req.params.id);
    const statusId = Number(req.params.statusId);
    if (!projectId || isNaN(projectId)) {
      return res.status(400).json({ success: false, error: 'Invalid project ID.' });
    }
    if (!statusId || isNaN(statusId)) {
      return res.status(400).json({ success: false, error: 'Invalid status ID.' });
    }

    const existsRes = await client.query(
      'SELECT 1 FROM projects WHERE id = $1 AND deleted_at IS NULL',
      [projectId]
    );
    if (existsRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Project not found.' });
    }

    const hasAccess = await checkProjectAccess(client, projectId, userId, userRole);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You do not have access to this project.',
      });
    }

    const statusRes = await client.query(
      'SELECT id, name FROM task_statuses WHERE id = $1 AND project_id = $2',
      [statusId, projectId]
    );
    if (statusRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Status not found.' });
    }

    // Unset any existing completion status, then set this one
    await client.query(
      `UPDATE task_statuses SET is_completion_status = FALSE WHERE project_id = $1`,
      [projectId]
    );
    await client.query(
      `UPDATE task_statuses SET is_completion_status = TRUE WHERE id = $1 AND project_id = $2`,
      [statusId, projectId]
    );

    return res.status(200).json({
      success: true,
      message: `Status '${statusRes.rows[0].name}' designated as completion status.`,
    });
  } catch (err: any) {
    console.error('PATCH /api/projects/:id/statuses/:statusId/completion error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to designate completion status.' });
  } finally {
    client.release();
  }
});

export default router;



