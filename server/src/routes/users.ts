import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { pool } from '../db';
import { authenticateToken, requirePM, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// =========================================================================
// Roles Catalog Endpoints (All authenticated users can manage)
// =========================================================================

router.get('/roles', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Sync current user's role into catalog if missing
    if (req.user?.id) {
      try {
        const ur = await pool.query('SELECT role FROM users WHERE id = $1', [req.user!.id]);
        if (ur.rows.length > 0 && ur.rows[0].role) {
          await pool.query('INSERT INTO roles_catalog (name, description, is_system) VALUES ($1, $2, TRUE) ON CONFLICT (name) DO NOTHING', [ur.rows[0].role, 'Default role']);
        }
      } catch (e) {}
    }
    const result = await pool.query(
      'SELECT id, name, description, is_system, created_at, updated_at FROM roles_catalog WHERE is_system = false OR name = (SELECT role FROM users WHERE id = $1) ORDER BY is_system DESC, id ASC',
      [req.user!.id]
    );
    if (result.rows.length === 0 && req.user?.id) {
       const ur = await pool.query('SELECT role FROM users WHERE id = $1', [req.user!.id]);
      if (ur.rows.length > 0 && ur.rows[0].role) {
        return res.status(200).json({ success: true, count: 1, roles: [{ id: 0, name: ur.rows[0].role, description: null, isSystem: true }] });
      }
    }
    return res.status(200).json({
      success: true,
      count: result.rows.length,
      roles: result.rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        isSystem: Boolean(r.is_system),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err: any) {
    console.error('GET /api/users/roles error:', err.message);
    try {
      const userId = (req as AuthenticatedRequest).user?.id;
      if (userId) {
        const ur = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
        if (ur.rows.length > 0 && ur.rows[0].role) {
          return res.status(200).json({ success: true, count: 1, roles: [{ id: 0, name: ur.rows[0].role, description: null, isSystem: true }] });
        }
      }
    } catch (e) {}
    return res.status(500).json({ success: false, error: 'Failed to retrieve roles.' });
  }
});
router.post('/roles', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, error: 'Role name is required.' });
    }
    const trimmedName = String(name).trim();
    const dup = await pool.query('SELECT id FROM roles_catalog WHERE name ILIKE $1', [trimmedName]);
    if (dup.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'A role with this name already exists.' });
    }
const result = await pool.query(
      'INSERT INTO roles_catalog (name, description) VALUES ($1, $2) RETURNING id, name, description, is_system, created_at, updated_at',
      [trimmedName, description ? String(description).trim() : null]
    );
    const r = result.rows[0];
    return res.status(201).json({
      success: true,
      message: 'Role created successfully.',
      role: {
        id: r.id,
        name: r.name,
        description: r.description,
        isSystem: Boolean(r.is_system),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      },
    });
  } catch (err: any) {
    console.error('POST /api/users/roles error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to create role.' });
  }
});

router.patch('/roles/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id || isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid role ID.' });
    }
    const { name, description } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, error: 'Role name is required.' });
    }
    const trimmedName = String(name).trim();
    const dup = await pool.query('SELECT id FROM roles_catalog WHERE name ILIKE $1 AND id != $2', [trimmedName, id]);
    if (dup.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'A role with this name already exists.' });
    }
const result = await pool.query(
      'UPDATE roles_catalog SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING id, name, description, is_system, created_at, updated_at',
      [trimmedName, description !== undefined ? (description ? String(description).trim() : null) : null, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Role not found.' });
    }
    const r = result.rows[0];
    return res.status(200).json({
      success: true,
      message: 'Role updated successfully.',
      role: {
        id: r.id,
        name: r.name,
        description: r.description,
        isSystem: Boolean(r.is_system),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      },
    });
  } catch (err: any) {
    console.error('PATCH /api/users/roles/:id error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to update role.' });
  }
});

// =========================================================================
// Skills Catalog Endpoints (All authenticated users can manage)
// =========================================================================

router.get('/skills', authenticateToken, async (_req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT id, name, description, is_system, created_at, updated_at FROM skills_catalog WHERE is_system = false ORDER BY id ASC');
    return res.status(200).json({
      success: true,
      count: result.rows.length,
      skills: result.rows.map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        isSystem: Boolean(s.is_system),
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      })),
    });
  } catch (err: any) {
    console.error('GET /api/users/skills error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to retrieve skills.' });
  }
});
router.post('/skills', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, error: 'Skill name is required.' });
    }
    const trimmedName = String(name).trim();
    const dup = await pool.query('SELECT id FROM skills_catalog WHERE name ILIKE $1', [trimmedName]);
    if (dup.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'A skill with this name already exists.' });
    }
const result = await pool.query(
      'INSERT INTO skills_catalog (name, description) VALUES ($1, $2) RETURNING id, name, description, is_system, created_at, updated_at',
      [trimmedName, description ? String(description).trim() : null]
    );
    const s = result.rows[0];
    return res.status(201).json({
      success: true,
      message: 'Skill created successfully.',
      skill: {
        id: s.id,
        name: s.name,
        description: s.description,
        isSystem: Boolean(s.is_system),
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      },
    });
  } catch (err: any) {
    console.error('POST /api/users/skills error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to create skill.' });
  }
});

router.patch('/skills/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id || isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid skill ID.' });
    }
    const { name, description } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, error: 'Skill name is required.' });
    }
    const trimmedName = String(name).trim();
    const dup = await pool.query('SELECT id FROM skills_catalog WHERE name ILIKE $1 AND id != $2', [trimmedName, id]);
    if (dup.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'A skill with this name already exists.' });
    }
    const result = await pool.query(
      'UPDATE skills_catalog SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING id, name, description, is_system, created_at, updated_at',
      [trimmedName, description !== undefined ? (description ? String(description).trim() : null) : null, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Skill not found.' });
    }
    const s = result.rows[0];
    return res.status(200).json({
      success: true,
      message: 'Skill updated successfully.',
      skill: {
        id: s.id,
        name: s.name,
        description: s.description,
        isSystem: Boolean(s.is_system),
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      },
    });
  } catch (err: any) {
    console.error('PATCH /api/users/skills/:id error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to update skill.' });
  }
});

router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    const result = await pool.query(
      `SELECT id, name, email, role, team, skills, is_active, must_change_password, created_at, updated_at
       FROM users
       WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User profile not found.' });
    }

    const u = result.rows[0];
    return res.status(200).json({
      success: true,
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        team: u.team || 'General',
        skills: u.skills ? String(u.skills).split(',').map((s: string) => s.trim()).filter(Boolean) : [],
        isActive: Boolean(u.is_active),
        mustChangePassword: Boolean(u.must_change_password),
        createdAt: u.created_at,
        updatedAt: u.updated_at,
      },
    });
  } catch (err: any) {
    console.error('GET /api/users/me error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to retrieve user profile.' });
  }
});

/**
 * PATCH /api/users/me
 * Updates current user's personal details (name, email).
 * Strictly prevents changing role, team, or activation status.
 */
router.patch('/me', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    // Security check: users must not change their own role or team
    if (req.body.role !== undefined) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You cannot change your own role.',
      });
    }

    if (req.body.team !== undefined) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You cannot change your own team assignment.',
      });
    }

    if (req.body.is_active !== undefined || req.body.isActive !== undefined) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You cannot change your own activation status.',
      });
    }

    const { name, email } = req.body;

    if (!name && !email) {
      return res.status(400).json({
        success: false,
        error: 'Please provide at least a name or email to update.',
      });
    }

    // Fetch current user record
    const currentRes = await pool.query(
      'SELECT id, name, email, role, team, is_active FROM users WHERE id = $1',
      [userId]
    );

    if (currentRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const currentUser = currentRes.rows[0];
    const newName = name && typeof name === 'string' && name.trim() ? name.trim() : currentUser.name;
    let newEmail = currentUser.email;

    if (email && typeof email === 'string' && email.trim()) {
      const trimmedEmail = email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        return res.status(400).json({
          success: false,
          error: 'Please provide a valid email address.',
        });
      }

      if (trimmedEmail !== currentUser.email.toLowerCase()) {
        // Check uniqueness
        const dupCheck = await pool.query(
          'SELECT id FROM users WHERE LOWER(email) = $1 AND id != $2',
          [trimmedEmail, userId]
        );
        if (dupCheck.rows.length > 0) {
          return res.status(409).json({
            success: false,
            error: 'This email address is already in use by another account.',
          });
        }
        newEmail = trimmedEmail;
      }
    }

    const updateRes = await pool.query(
      `UPDATE users
       SET name = $1, email = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, name, email, role, team, is_active, must_change_password, created_at, updated_at`,
      [newName, newEmail, userId]
    );

    const u = updateRes.rows[0];
    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        team: u.team || 'General',
        isActive: Boolean(u.is_active),
        mustChangePassword: Boolean(u.must_change_password),
        createdAt: u.created_at,
        updatedAt: u.updated_at,
      },
    });
  } catch (err: any) {
    console.error('PATCH /api/users/me error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to update profile.' });
  }
});

/**
 * PATCH /api/users/me/password
 * Changes own password. Requires current password verification.
 */
router.patch('/me/password', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Both current password and new password are required.',
      });
    }

    if (typeof newPassword !== 'string' || newPassword.trim().length < 6) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters long.',
      });
    }

    const userRes = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const isMatch = await bcrypt.compare(currentPassword, userRes.rows[0].password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Current password does not match.',
      });
    }

    const isSame = await bcrypt.compare(newPassword, userRes.rows[0].password_hash);
    if (isSame) {
      return res.status(400).json({
        success: false,
        error: 'New password cannot be the same as your current password.',
      });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newHash, userId]
    );

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully.',
    });
  } catch (err: any) {
    console.error('PATCH /api/users/me/password error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to change password.' });
  }
});

// =========================================================================
// Project Manager User Management Endpoints (PM Role Required)
// =========================================================================

/**
 * GET /api/users
 * Lists all registered users with optional search and filters. PM only.
 */
router.get('/', authenticateToken, requirePM, async (req: Request, res: Response) => {
  try {
    const { search, role, team, status } = req.query;

    let query = `
      SELECT id, name, email, role, team, skills, is_active, must_change_password, created_at, updated_at
      FROM users
      WHERE 1=1
    `;
    const params: any[] = [];

    if (search && typeof search === 'string' && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (LOWER(name) LIKE $${params.length} OR LOWER(email) LIKE $${params.length})`;
    }

    if (role && typeof role === 'string' && role.trim() && role.toUpperCase() !== 'ALL') {
      params.push(role.trim().toUpperCase());
      query += ` AND UPPER(role) = $${params.length}`;
    }

    if (team && typeof team === 'string' && team.trim() && team.toUpperCase() !== 'ALL') {
      params.push(`%${team.trim().toLowerCase()}%`);
      query += ` AND LOWER(team) LIKE $${params.length}`;
    }

    if (status && typeof status === 'string' && status.trim() && status.toUpperCase() !== 'ALL') {
      if (status.toLowerCase() === 'active') {
        query += ' AND is_active = TRUE';
      } else if (status.toLowerCase() === 'inactive' || status.toLowerCase() === 'deactivated') {
        query += ' AND is_active = FALSE';
      }
    }

    query += ' ORDER BY id ASC';

    const result = await pool.query(query, params);

    const users = result.rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      team: u.team || 'General',
      skills: u.skills ? String(u.skills).split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      isActive: Boolean(u.is_active),
      mustChangePassword: Boolean(u.must_change_password),
      createdAt: u.created_at,
      updatedAt: u.updated_at,
    }));

    return res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (err: any) {
    console.error('GET /api/users error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to retrieve users.' });
  }
});

/**
 * POST /api/users
 * Creates a new user account with temporary password. PM only.
 */
router.post('/', authenticateToken, requirePM, async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, team, skills } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, temporary password, and role are required.',
      });
    }

    const trimmedName = String(name).trim();
    const trimmedEmail = String(email).trim().toLowerCase();
    const rawPassword = String(password).trim();
    const normalizedRole = String(role).trim().toUpperCase();
    const userTeam = team && String(team).trim() ? String(team).trim() : 'General';
    const userSkills = Array.isArray(skills)
      ? skills.map(String).filter(Boolean).join(',')
      : skills && String(skills).trim()
      ? String(skills).trim()
      : null;

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid email address.',
      });
    }

    // Validate role
    const validRoles = ['PM', 'TL', 'TM', 'TESTER'];
    if (!validRoles.includes(normalizedRole)) {
      return res.status(400).json({
        success: false,
        error: `Invalid role. Allowed roles are: ${validRoles.join(', ')}.`,
      });
    }

    // Validate temporary password length
    if (rawPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Temporary password must be at least 6 characters long.',
      });
    }

    // Check if email already exists
    const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [trimmedEmail]);
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'A user account with this email address already exists.',
      });
    }

    // Hash the temporary password
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    // Insert user with must_change_password = TRUE
    const insertRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, team, skills, is_active, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE)
       RETURNING id, name, email, role, team, skills, is_active, must_change_password, created_at, updated_at`,
      [trimmedName, trimmedEmail, passwordHash, normalizedRole, userTeam, userSkills]
    );

    const newUser = insertRes.rows[0];

    return res.status(201).json({
      success: true,
      message: 'User account created successfully. The user must change their temporary password at first login.',
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        team: newUser.team,
        skills: newUser.skills ? String(newUser.skills).split(',').map((s: string) => s.trim()).filter(Boolean) : [],
        isActive: Boolean(newUser.is_active),
        mustChangePassword: Boolean(newUser.must_change_password),
        createdAt: newUser.created_at,
        updatedAt: newUser.updated_at,
      },
    });
  } catch (err: any) {
    console.error('POST /api/users error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to create user account.' });
  }
});

/**
 * PATCH /api/users/:id
 * Updates an existing user's details (name, email, role, team). PM only.
 */
router.patch('/:id', authenticateToken, requirePM, async (req: Request, res: Response) => {
  try {
    const targetId = Number(req.params.id);
    if (!targetId || isNaN(targetId)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID.' });
    }

    const { name, email, role, team, skills } = req.body;

    // Check if user exists
    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [targetId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User account not found.' });
    }

    const currentUser = userRes.rows[0];
    const updatedName = name && String(name).trim() ? String(name).trim() : currentUser.name;
    const updatedTeam = team !== undefined ? String(team).trim() : currentUser.team;
    const updatedSkills = Array.isArray(skills)
      ? skills.map(String).filter(Boolean).join(',')
      : skills !== undefined
      ? String(skills).trim()
      : currentUser.skills || null;

    let updatedEmail = currentUser.email;
    if (email && String(email).trim()) {
      const trimmedEmail = String(email).trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
      }

      if (trimmedEmail !== currentUser.email.toLowerCase()) {
        const dupCheck = await pool.query(
          'SELECT id FROM users WHERE LOWER(email) = $1 AND id != $2',
          [trimmedEmail, targetId]
        );
        if (dupCheck.rows.length > 0) {
          return res.status(409).json({
            success: false,
            error: 'This email is already registered to another user.',
          });
        }
        updatedEmail = trimmedEmail;
      }
    }

    let updatedRole = currentUser.role;
    if (role && String(role).trim()) {
      const normalizedRole = String(role).trim().toUpperCase();
      const validRoles = ['PM', 'TL', 'TM', 'TESTER'];
      if (!validRoles.includes(normalizedRole)) {
        return res.status(400).json({
          success: false,
          error: `Invalid role. Allowed roles are: ${validRoles.join(', ')}.`,
        });
      }
      updatedRole = normalizedRole;
    }

    const updateRes = await pool.query(
      `UPDATE users
       SET name = $1, email = $2, role = $3, team = $4, skills = $6, updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING id, name, email, role, team, skills, is_active, must_change_password, created_at, updated_at`,
      [updatedName, updatedEmail, updatedRole, updatedTeam, targetId, updatedSkills]
    );

    const u = updateRes.rows[0];
    return res.status(200).json({
      success: true,
      message: 'User updated successfully.',
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        team: u.team,
        skills: u.skills ? String(u.skills).split(',').map((s: string) => s.trim()).filter(Boolean) : [],
        isActive: Boolean(u.is_active),
        mustChangePassword: Boolean(u.must_change_password),
        createdAt: u.created_at,
        updatedAt: u.updated_at,
      },
    });
  } catch (err: any) {
    console.error('PATCH /api/users/:id error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to update user.' });
  }
});

/**
 * PATCH /api/users/:id/status
 * Activates or deactivates a user account. PM only.
 */
router.patch('/:id/status', authenticateToken, requirePM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetId = Number(req.params.id);
    if (!targetId || isNaN(targetId)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID.' });
    }

    const { is_active } = req.body;
    if (typeof is_active !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'Field "is_active" must be a boolean (true or false).',
      });
    }

    // Safety: prevent PM from deactivating their own account
    if (req.user?.id === targetId && is_active === false) {
      return res.status(400).json({
        success: false,
        error: 'You cannot deactivate your own account.',
      });
    }

    const userRes = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [targetId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User account not found.' });
    }

    const updateRes = await pool.query(
      `UPDATE users
       SET is_active = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, name, email, role, team, is_active, must_change_password, created_at, updated_at`,
      [is_active, targetId]
    );

    const u = updateRes.rows[0];
    return res.status(200).json({
      success: true,
      message: `User account has been ${is_active ? 'activated' : 'deactivated'}.`,
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        team: u.team,
        isActive: Boolean(u.is_active),
        mustChangePassword: Boolean(u.must_change_password),
        createdAt: u.created_at,
        updatedAt: u.updated_at,
      },
    });
  } catch (err: any) {
    console.error('PATCH /api/users/:id/status error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to update user status.' });
  }
});

/**
 * POST /api/users/:id/reset-password
 * Resets a user's password with a temporary password and forces change at next login. PM only.
 */
router.post('/:id/reset-password', authenticateToken, requirePM, async (req: Request, res: Response) => {
  try {
    const targetId = Number(req.params.id);
    if (!targetId || isNaN(targetId)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID.' });
    }

    const userRes = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [targetId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User account not found.' });
    }

    const { temporaryPassword } = req.body;
    let tempPass = temporaryPassword && String(temporaryPassword).trim() ? String(temporaryPassword).trim() : '';

    if (tempPass) {
      if (tempPass.length < 6) {
        return res.status(400).json({
          success: false,
          error: 'Temporary password must be at least 6 characters long.',
        });
      }
    } else {
      // Auto-generate temporary password
      tempPass = `PmsTemp#${crypto.randomBytes(3).toString('hex')}!`;
    }

    const hash = await bcrypt.hash(tempPass, 10);

    const updateRes = await pool.query(
      `UPDATE users
       SET password_hash = $1, must_change_password = TRUE, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, name, email, role, team, is_active, must_change_password, created_at, updated_at`,
      [hash, targetId]
    );

    const u = updateRes.rows[0];
    return res.status(200).json({
      success: true,
      message: 'Password reset successfully. The user must change their temporary password at next login.',
      temporaryPassword: tempPass,
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        team: u.team,
        isActive: Boolean(u.is_active),
        mustChangePassword: Boolean(u.must_change_password),
        createdAt: u.created_at,
        updatedAt: u.updated_at,
      },
    });
  } catch (err: any) {
    console.error('POST /api/users/:id/reset-password error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to reset password.' });
  }
});

export default router;









