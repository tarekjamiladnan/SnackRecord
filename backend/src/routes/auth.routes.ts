import { Router } from 'express';
import { body } from 'express-validator';
import { authService } from '../services/auth.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { validate } from '../validators/validate.js';

export const authRoutes = Router();

authRoutes.post(
  '/register',
  [
    body('teamName').isString().isLength({ min: 2, max: 120 }).withMessage('Team name is required'),
    body('adminName').isString().isLength({ min: 2, max: 120 }).withMessage('Admin name is required'),
    body('adminEmail').isEmail().withMessage('Valid admin email is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('confirmPassword').isLength({ min: 8 }).withMessage('Confirm password is required')
  ],
  validate,
  async (req: any, res: any, next: any) => {
    try {
      const result = await authService.registerTeam(req.body);
      res.status(201).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
);

authRoutes.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isString().isLength({ min: 1 }).withMessage('Password is required')
  ],
  validate,
  async (req: any, res: any, next: any) => {
    try {
      const result = await authService.login(req.body.email, req.body.password);
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
);

authRoutes.get('/me', authMiddleware, async (req: any, res: any, next: any) => {
  try {
    const user = await authService.me(req.user!.id);
    res.json({ success: true, user });
  } catch (error) {
    next(error);
  }
});

authRoutes.put(
  '/update-password',
  authMiddleware,
  [body('newPassword').isString().isLength({ min: 6 }).withMessage('New password must be at least 6 characters')],
  validate,
  async (req: any, res: any, next: any) => {
    try {
      const result = await authService.updatePassword(req.user!.id, req.body.newPassword);
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
);
