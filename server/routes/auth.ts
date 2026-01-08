import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../db';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { logger } from '../services/logger';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Helper function to check if email is admin
function isAdminEmail(email: string): boolean {
  const adminAccounts = process.env.ADMIN_ACCOUNTS || '';
  const adminEmails = adminAccounts.split(',').map(e => e.trim().toLowerCase()).filter(e => e.length > 0);
  return adminEmails.includes(email.toLowerCase());
}

// Validation schemas
const signupSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  fullName: z.string().optional(),
});

const signinSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

// Helper function to generate JWT
function generateToken(userId: string, email: string): string {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// POST /api/auth/signup
router.post('/signup', asyncHandler(async (req: Request, res: Response) => {
  const validatedData = signupSchema.parse(req.body);
  const { email, password, fullName } = validatedData;

  // Check if user already exists
  const existingUser = await query(
    'SELECT id FROM deploy_users WHERE email = $1',
    [email.toLowerCase()]
  );

  if (existingUser.rows.length > 0) {
    throw new AppError('Email already registered', 409);
  }

  // Hash password
  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  // Create user
  const result = await query(
    `INSERT INTO deploy_users (email, password_hash, full_name)
     VALUES ($1, $2, $3)
     RETURNING id, email, full_name, created_at`,
    [email.toLowerCase(), passwordHash, fullName || null]
  );

  const user = result.rows[0];
  const token = generateToken(user.id, user.email);
  const isAdmin = isAdminEmail(user.email);

  logger.info('User signed up successfully', { userId: user.id, email: user.email, isAdmin });

  res.status(201).json({
    success: true,
    message: 'Account created successfully',
    data: {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        createdAt: user.created_at,
        isAdmin,
      },
      token,
    },
  });
}));

// POST /api/auth/signin
router.post('/signin', asyncHandler(async (req: Request, res: Response) => {
  const validatedData = signinSchema.parse(req.body);
  const { email, password } = validatedData;

  // Find user
  const result = await query(
    'SELECT id, email, password_hash, full_name FROM deploy_users WHERE email = $1',
    [email.toLowerCase()]
  );

  if (result.rows.length === 0) {
    throw new AppError('Invalid email or password', 401);
  }

  const user = result.rows[0];

  // Verify password
  const isValidPassword = await bcrypt.compare(password, user.password_hash);

  if (!isValidPassword) {
    throw new AppError('Invalid email or password', 401);
  }

  const token = generateToken(user.id, user.email);
  const isAdmin = isAdminEmail(user.email);

  logger.info('User signed in successfully', { userId: user.id, email: user.email, isAdmin });

  res.json({
    success: true,
    message: 'Signed in successfully',
    data: {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        isAdmin,
      },
      token,
    },
  });
}));

// GET /api/auth/me - Get current user info
router.get('/me', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await query(
    'SELECT id, email, full_name, created_at FROM deploy_users WHERE id = $1',
    [req.userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  const user = result.rows[0];
  const isAdmin = isAdminEmail(user.email);

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        createdAt: user.created_at,
        isAdmin,
      },
    },
  });
}));

// POST /api/auth/change-password - Change user password
router.post('/change-password', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
  const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(6, 'New password must be at least 6 characters'),
  });

  const validatedData = changePasswordSchema.parse(req.body);
  const { currentPassword, newPassword } = validatedData;

  // Get user with current password hash
  const result = await query(
    'SELECT id, email, password_hash FROM deploy_users WHERE id = $1',
    [req.userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  const user = result.rows[0];

  // Verify current password
  const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);

  if (!isValidPassword) {
    throw new AppError('Current password is incorrect', 401);
  }

  // Hash new password
  const saltRounds = 10;
  const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

  // Update password
  await query(
    'UPDATE deploy_users SET password_hash = $1 WHERE id = $2',
    [newPasswordHash, req.userId]
  );

  logger.info('Password changed successfully', { userId: req.userId });

  res.json({
    success: true,
    message: 'Password changed successfully',
  });
}));

export default router;
