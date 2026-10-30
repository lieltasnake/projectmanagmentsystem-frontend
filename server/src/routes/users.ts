import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { pool } from '../db';
import { authenticateToken, requirePM, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// =========================================================================
// Current User Endpoints (Accessible to any authenticated user)
// =========================================================================

/**
 * GET /api/users/me
 * Retrieves profile of the currently logged-in user.
 */
router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    const result = await pool.query(
      `SELECT id, name, email, role, team, is_active, must_change_password, created_at, updated_at
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
      SELECT id, name, email, role, team, is_active, must_change_password, created_at, updated_at
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
    const { name, email, password, role, team } = req.body;

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
      `INSERT INTO users (name, email, password_hash, role, team, is_active, must_change_password)
       VALUES ($1, $2, $3, $4, $5, TRUE, TRUE)
       RETURNING id, name, email, role, team, is_active, must_change_password, created_at, updated_at`,
      [trimmedName, trimmedEmail, passwordHash, normalizedRole, userTeam]
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

    const { name, email, role, team } = req.body;

    // Check if user exists
    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [targetId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User account not found.' });
    }

    const currentUser = userRes.rows[0];
    const updatedName = name && String(name).trim() ? String(name).trim() : currentUser.name;
    const updatedTeam = team !== undefined ? String(team).trim() : currentUser.team;

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
       SET name = $1, email = $2, role = $3, team = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING id, name, email, role, team, is_active, must_change_password, created_at, updated_at`,
      [updatedName, updatedEmail, updatedRole, updatedTeam, targetId]
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
        team: u.team || 'General',
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
