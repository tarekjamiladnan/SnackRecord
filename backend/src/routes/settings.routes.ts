import { Router } from 'express';
import { body, param } from 'express-validator';
import { Prisma, Role } from '@prisma/client';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { prisma } from '../config/prisma.js';
import { validate } from '../validators/validate.js';

export const settingsRoutes = Router();

settingsRoutes.use(authMiddleware);
settingsRoutes.use((req: any, res: any, next: any) => {
  if (req.user?.teamId) return next();
  return res.status(403).json({ success: false, message: 'Team access required' });
});

const serializeSettings = (settings: any) => ({
  ...settings,
  minBalanceEnabled: settings.minBalanceEnabled ?? false,
  minBalanceAmount: Number(settings.minBalanceAmount ?? 20),
  orderClosingTime: settings.orderClosingTime || '16:20'
});

settingsRoutes.get('/:id', [param('id').isString()], validate, async (req: any, res: any, next: any) => {
  try {
    const teamId = req.user!.teamId!;
    const settings = await prisma.teamSetting.upsert({
      where: { teamId },
      update: {},
      create: { teamId }
    });
    return res.json({ success: true, data: serializeSettings(settings) });
  } catch (error) {
    return next(error);
  }
});

settingsRoutes.put(
  '/:id',
[
    param('id').isString(),
    body('managerName').optional({ values: 'falsy' }).isString(),
    body('companyName').optional({ values: 'falsy' }).isString(),
    body('currency').optional({ values: 'falsy' }).isString(),
    body('minBalanceEnabled').optional().isBoolean(),
    body('minBalanceAmount').optional({ values: 'falsy' }).isNumeric(),
    body('orderClosingTime').optional({ values: 'falsy' }).isString().matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  ],
  validate,
  requireRole(Role.TEAM_ADMIN),
  async (req: any, res: any, next: any) => {
    try {
      const teamId = req.user!.teamId!;
      const settings = await prisma.teamSetting.upsert({
        where: { teamId },
        update: {
          ...(req.body.managerName !== undefined ? { managerName: String(req.body.managerName || '').trim() || null } : {}),
          ...(req.body.companyName !== undefined ? { companyName: String(req.body.companyName).trim() || 'Phantom Snack Record' } : {}),
          ...(req.body.currency !== undefined ? { currency: String(req.body.currency).trim() || 'BDT' } : {}),
          ...(req.body.minBalanceEnabled !== undefined ? { minBalanceEnabled: Boolean(req.body.minBalanceEnabled) } : {}),
          ...(req.body.minBalanceAmount !== undefined ? { minBalanceAmount: new Prisma.Decimal(req.body.minBalanceAmount) } : {}),
          ...(req.body.orderClosingTime !== undefined ? { orderClosingTime: String(req.body.orderClosingTime).trim() || '16:20' } : {})
        },
        create: {
          teamId,
          managerName: req.body.managerName ? String(req.body.managerName).trim() : null,
          companyName: req.body.companyName ? String(req.body.companyName).trim() : 'Phantom Snack Record',
          currency: req.body.currency ? String(req.body.currency).trim() : 'BDT',
          minBalanceEnabled: Boolean(req.body.minBalanceEnabled ?? false),
          minBalanceAmount: new Prisma.Decimal(req.body.minBalanceAmount ?? 20),
          orderClosingTime: String(req.body.orderClosingTime || '16:20').trim() || '16:20'
        }
      });
      return res.json({ success: true, data: serializeSettings(settings) });
    } catch (error) {
      return next(error);
    }
  }
);
