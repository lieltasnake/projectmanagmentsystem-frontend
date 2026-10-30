import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
import { authenticateToken, AuthenticatedRequest, JWT_SECRET } from '../middleware/auth';

const router = Router();

/**
 * POST /api/auth/login
 * Authenticates user credentials against the existing users table using bcrypt and returns a JWT token.
 * Validates active status and flags first-login password change requirement.
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validate presence and types of email and password
    if (
      !email ||
      !password ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !email.trim() ||
      !password.trim()
    ) {
      return res.status(400).json({
        success: false,
        error: 'Both email and password are required.',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Query user by email (case-insensitive)
    const result = await pool.query(
      `SELECT id, name, email, password_hash, role, team, is_active, must_change_password, created_at
       FROM users
       WHERE LOWER(email) = $1`,
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.',
      });
    }

    const user = result.rows[0];

    // Check account activation status
    if (user.is_active === false) {
      return res.status(403).json({
        success: false,
        error: 'Your account has been deactivated. Please contact your Project Manager.',
      });
    }

    // Compare provided password with bcrypt password hash
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.',
      });
    }

    // Create safe JWT payload (no password hash)
    const tokenPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      team: user.team || 'General',
      mustChangePassword: Boolean(user.must_change_password),
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });

    // Respond with token, safe user details, and password-change flag
    return res.status(200).json({
      success: true,
      message: user.must_change_password
        ? 'First-login password change required.'
        : 'Login successful',
      mustChangePassword: Boolean(user.must_change_password),
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        team: user.team || 'General',
        isActive: Boolean(user.is_active),
        mustChangePassword: Boolean(user.must_change_password),
        createdAt: user.created_at,
      },
    });
  } catch (err: any) {
    console.error('Login route error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'An internal server error occurred during login. Please try again later.',
    });
  }
});

/**
 * POST /api/auth/change-temporary-password
 * Completes first-login password change for accounts created or reset by the PM.
 * Requires bearer authentication token.
 */
router.post(
  '/change-temporary-password',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required.',
        });
      }

      const { currentPassword, newPassword } = req.body;

      if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 6) {
        return res.status(400).json({
          success: false,
          error: 'New password must be at least 6 characters long.',
        });
      }

      // Fetch user from DB
      const result = await pool.query(
        'SELECT id, name, email, role, team, is_active, must_change_password, password_hash FROM users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'User not found.',
        });
      }

      const user = result.rows[0];

      if (!user.is_active) {
        return res.status(403).json({
          success: false,
          error: 'Account is deactivated.',
        });
      }

      // If currentPassword is provided, verify it
      if (currentPassword && typeof currentPassword === 'string') {
        const matchesCurrent = await bcrypt.compare(currentPassword, user.password_hash);
        if (!matchesCurrent) {
          return res.status(401).json({
            success: false,
            error: 'Current temporary password is incorrect.',
          });
        }
      }

      // Ensure new password is not identical to the current one
      const isSamePassword = await bcrypt.compare(newPassword, user.password_hash);
      if (isSamePassword) {
        return res.status(400).json({
          success: false,
          error: 'New password must be different from your current temporary password.',
        });
      }

      // Hash the new password securely
      const newHash = await bcrypt.hash(newPassword, 10);

      // Update in DB and clear must_change_password flag
      await pool.query(
        `UPDATE users
         SET password_hash = $1, must_change_password = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [newHash, userId]
      );

      // Generate a new normal JWT token
      const tokenPayload = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        team: user.team || 'General',
        mustChangePassword: false,
      };

      const freshToken = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });

      return res.status(200).json({
        success: true,
        message: 'Password changed successfully. You may now access your dashboard.',
        token: freshToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          team: user.team || 'General',
          isActive: true,
          mustChangePassword: false,
        },
      });
    } catch (err: any) {
      console.error('Change temporary password error:', err.message);
      return res.status(500).json({
        success: false,
        error: 'An internal server error occurred while updating your password.',
      });
    }
  }
);

/**
 * GET /api/auth/me
 * Protected endpoint returning safe profile of the currently authenticated user.
 */
router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Invalid session context.',
      });
    }

    const result = await pool.query(
      `SELECT id, name, email, role, team, is_active, must_change_password, created_at, updated_at
       FROM users
       WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User account not found.',
      });
    }

    const user = result.rows[0];

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        team: user.team || 'General',
        isActive: Boolean(user.is_active),
        mustChangePassword: Boolean(user.must_change_password),
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
    });
  } catch (err: any) {
    console.error('Get profile (/api/auth/me) error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'An internal server error occurred while retrieving profile.',
    });
  }
});

export default router;
