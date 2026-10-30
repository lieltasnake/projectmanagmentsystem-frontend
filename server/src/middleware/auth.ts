import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthUserPayload {
  id: number;
  email: string;
  name: string;
  role: 'PM' | 'TL' | 'TM' | 'TESTER' | string;
  team?: string;
  mustChangePassword?: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUserPayload;
}

export const JWT_SECRET = process.env.JWT_SECRET || 'pms_dev_secret_key_2026_super_secure_auth';

/**
 * JWT authentication middleware.
 * Validates the Authorization: Bearer <token> header and attaches decoded user to req.user.
 */
export function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    res.status(401).json({
      success: false,
      error: 'Authentication required. No authorization header provided.',
    });
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer') {
    res.status(401).json({
      success: false,
      error: 'Authentication required. Invalid authorization format. Expected "Bearer <token>".',
    });
    return;
  }

  const token = parts[1];
  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Authentication required. No token provided.',
    });
    return;
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired token.',
      });
      return;
    }

    req.user = decoded as AuthUserPayload;
    next();
  });
}

/**
 * Role-based authorization middleware.
 * Restricts endpoint to specific roles (e.g. 'PM').
 */
export function requireRoles(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required.',
      });
      return;
    }

    const userRole = (req.user.role || '').toUpperCase();
    const normalizedAllowed = allowedRoles.map((r) => r.toUpperCase());

    if (!normalizedAllowed.includes(userRole)) {
      res.status(403).json({
        success: false,
        error: `Forbidden: Only ${allowedRoles.join('/')} can perform this action.`,
      });
      return;
    }

    next();
  };
}

/**
 * Convenience middleware to require Project Manager (PM) role.
 */
export const requirePM = requireRoles('PM');
