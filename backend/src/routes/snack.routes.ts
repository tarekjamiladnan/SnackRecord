import { Router } from 'express';
import { body, param } from 'express-validator';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { prisma } from '../config/prisma.js';
import { validate } from '../validators/validate.js';
import { Role } from '@prisma/client';

export const snackRoutes = Router();

snackRoutes.use(authMiddleware);
snackRoutes.use((req, res, next) => {
  if (req.user?.role === Role.SUPER_ADMIN) return next();
  if (req.user?.teamId) return next();
  return res.status(403).json({ success: false, message: 'Team access required' });
});

snackRoutes.get('/', async (req: any, res: any, next: any) => {
  try {
    const page = Math.max(0, Number(req.query.page) || 0);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
    const search = String(req.query.search || '').trim();
    const where: any = { teamId: req.user!.teamId! };
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const [total, snacks] = await Promise.all([
      prisma.snack.count({ where }),
      prisma.snack.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: page * pageSize,
        take: pageSize
      })
    ]);
    res.json({ success: true, data: snacks.map((snack) => ({ ...snack, price: Number(snack.price) })), total, page, pageSize });
  } catch (error) {
    next(error);
  }
});

snackRoutes.get('/legacy', async (req: any, res: any, next: any) => {
  try {
    const snacks = await prisma.snack.findMany({
      where: { teamId: req.user!.teamId! },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, snacks });
  } catch (error) {
    next(error);
  }
});

snackRoutes.post(
  '/',
  [
    body('name').isString().isLength({ min: 2 }).withMessage('Snack name is required'),
    body('price').isNumeric().withMessage('Price is required')
  ],
  validate,
  requireRole(Role.TEAM_ADMIN),
  async (req: any, res: any, next: any) => {
    try {
      const snack = await prisma.snack.create({
        data: {
          teamId: req.user!.teamId!,
          name: String(req.body.name).trim(),
          price: Number(req.body.price),
          status: 'active'
        }
      });
      res.status(201).json({ success: true, snack });
    } catch (error) {
      next(error);
    }
  }
);

snackRoutes.patch(
  '/:id',
  [param('id').isString()],
  validate,
  requireRole(Role.TEAM_ADMIN),
  async (req: any, res: any, next: any) => {
    try {
      const snack = await prisma.snack.findFirst({ where: { id: req.params.id, teamId: req.user!.teamId! } });
      if (!snack) return res.status(404).json({ success: false, message: 'Snack not found' });
      const updated = await prisma.snack.update({
        where: { id: snack.id },
        data: {
          ...(req.body.name ? { name: String(req.body.name).trim() } : {}),
          ...(req.body.price !== undefined ? { price: Number(req.body.price) } : {}),
          ...(req.body.status ? { status: String(req.body.status) } : {})
        }
      });
      res.json({ success: true, snack: updated });
    } catch (error) {
      next(error);
    }
  }
);

snackRoutes.delete(
  '/:id',
  [param('id').isString()],
  validate,
  requireRole(Role.TEAM_ADMIN),
  async (req: any, res: any, next: any) => {
    try {
      const snack = await prisma.snack.findFirst({ where: { id: req.params.id, teamId: req.user!.teamId! } });
      if (!snack) return res.status(404).json({ success: false, message: 'Snack not found' });
      await prisma.snack.delete({ where: { id: snack.id } });
      res.json({ success: true, message: 'Snack deleted' });
    } catch (error) {
      next(error);
    }
  }
);
