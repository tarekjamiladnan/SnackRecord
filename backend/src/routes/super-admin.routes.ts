import { Router } from 'express';
import { body, param } from 'express-validator';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { prisma } from '../config/prisma.js';
import { validate } from '../validators/validate.js';
import { Role, TeamStatus } from '@prisma/client';

export const superAdminRoutes = Router();

superAdminRoutes.use(authMiddleware, requireRole(Role.SUPER_ADMIN));

superAdminRoutes.get('/teams', async (_req: any, res: any, next: any) => {
  try {
    const teams = await prisma.team.findMany({
      include: {
        users: {
          select: { id: true, name: true, email: true, role: true, teamId: true }
        },
        _count: { select: { users: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, teams });
  } catch (error) {
    next(error);
  }
});

superAdminRoutes.post(
  '/teams',
  [
    body('name').isString().isLength({ min: 2 }).withMessage('Team name is required'),
    body('slug').optional().isString().isLength({ min: 2 }).withMessage('Slug is invalid')
  ],
  validate,
  async (req: any, res: any, next: any) => {
    try {
      const slug = String(req.body.slug || req.body.name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const team = await prisma.team.create({
        data: {
          name: String(req.body.name).trim(),
          slug: slug || 'team',
          status: TeamStatus.ACTIVE
        }
      });
      res.status(201).json({ success: true, team });
    } catch (error) {
      next(error);
    }
  }
);

superAdminRoutes.get('/teams/:id', [param('id').isString()], validate, async (req: any, res: any, next: any) => {
  try {
    const team = await prisma.team.findUnique({
      where: { id: req.params.id },
      include: {
        users: { select: { id: true, name: true, email: true, role: true, teamId: true } },
        snacks: true,
        records: true
      }
    });
    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });
    res.json({ success: true, team });
  } catch (error) {
    next(error);
  }
});

superAdminRoutes.patch('/teams/:id/status', [param('id').isString(), body('status').isIn(['ACTIVE', 'SUSPENDED', 'PENDING', 'REJECTED'])], validate, async (req: any, res: any, next: any) => {
  try {
    const team = await prisma.team.update({
      where: { id: req.params.id },
      data: { status: req.body.status }
    });
    res.json({ success: true, team });
  } catch (error) {
    next(error);
  }
});

superAdminRoutes.delete('/teams/:id', [param('id').isString()], validate, async (req: any, res: any, next: any) => {
  try {
    const teamId = req.params.id;

    await prisma.$transaction(async (tx) => {
      await tx.entryItem.deleteMany({ where: { teamId } });
      await tx.dailyEntry.deleteMany({ where: { teamId } });
      await tx.snackRecord.deleteMany({ where: { teamId } });
      await tx.memberMonthBalance.deleteMany({ where: { teamId } });
      await tx.collection.deleteMany({ where: { teamId } });
      await tx.expense.deleteMany({ where: { teamId } });
      await tx.orderRequest.deleteMany({ where: { teamId } });
      await tx.order.deleteMany({ where: { teamId } });
      await tx.member.deleteMany({ where: { teamId } });
      await tx.user.deleteMany({ where: { teamId } });
      await tx.snack.deleteMany({ where: { teamId } });
      await tx.menu.deleteMany({ where: { teamId } });
      await tx.month.deleteMany({ where: { teamId } });
      await tx.teamSetting.deleteMany({ where: { teamId } });
      await tx.auditLog.deleteMany({ where: { teamId } });
      await tx.team.delete({ where: { id: teamId } });
    });

    res.json({ success: true, message: 'Team deleted' });
  } catch (error) {
    next(error);
  }
});
