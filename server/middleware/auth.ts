import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './errorHandler';

export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
}

export interface JWTPayload {
  userId: string;
  email: string;
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    throw new AppError('Access token required', 401);
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError('Token expired', 401);
    }
    throw new AppError('Invalid token', 401);
  }
};

// Optional auth - doesn't throw error if no token
export const optionalAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
      req.userId = decoded.userId;
      req.userEmail = decoded.email;
    } catch (error) {
      // Invalid token, but we don't throw - just proceed without user
    }
  }
  
  next();
};

// Admin check middleware - must be used after authenticateToken
export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.userEmail) {
    throw new AppError('Authentication required', 401);
  }

  const adminAccounts = process.env.ADMIN_ACCOUNTS || '';
  const adminEmails = adminAccounts.split(',').map(e => e.trim().toLowerCase()).filter(e => e.length > 0);
  
  if (!adminEmails.includes(req.userEmail.toLowerCase())) {
    throw new AppError('Admin access required', 403);
  }

  next();
};
