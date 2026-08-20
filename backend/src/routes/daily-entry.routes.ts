import { Router } from 'express';
import { body } from 'express-validator';
import { MonthStatus } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';
import { prisma } from '../config/prisma.js';
import { validate } from '../validators/validate.js';

export const dailyEntryRoutes = Router();

dailyEntryRoutes.use(authMiddleware);
dailyEntryRoutes.use((req: any, res: any, next: any) => {
  if (req.user?.role === 'SUPER_ADMIN') return next();
  if (req.user?.teamId) return next();
  return res.status(403).json({ success: false, message: 'Team access required' });
});

const serializeMonth = (month: any) => ({
  ...month,
  openingCash: Number(month.openingCash),
  closingCash: Number(month.closingCash),
  status: String(month.status).toLowerCase()
});

const serializeItem = (item: any) => ({
  ...item,
  quantity: Number(item.quantity),
  price: Number(item.price),
  amount: Number(item.amount)
});

const dateFromString = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

dailyEntryRoutes.get('/open-month', async (req: any, res: any, next: any) => {
  try {
    const teamId = req.user!.teamId!;
    const month = await prisma.month.findFirst({ where: { teamId, status: MonthStatus.OPEN } });
    return res.json({ success: true, data: month ? serializeMonth(month) : null });
  } catch (error) {
    return next(error);
  }
});

dailyEntryRoutes.get('/', async (req: any, res: any, next: any) => {
  try {
    const teamId = req.user!.teamId!;
    const rawDate = String(req.query.date || '');
    const entryDate = rawDate ? dateFromString(rawDate) : null;

    const entry = entryDate ? await prisma.dailyEntry.findFirst({ where: { teamId, entryDate } }) : null;
    const items = entry ? await prisma.entryItem.findMany({ where: { teamId, entryId: entry.id } }) : [];

    return res.json({
      success: true,
      data: {
        entry: entry ? { ...entry, totalCost: Number(entry.totalCost) } : null,
        items: items.map(serializeItem)
      }
    });
  } catch (error) {
    return next(error);
  }
});

dailyEntryRoutes.post(
  '/',
  [
    body('entryDate').isISO8601().withMessage('Valid date is required'),
    body('items').isArray().withMessage('Items are required')
  ],
  validate,
  async (req: any, res: any, next: any) => {
    try {
      const teamId = req.user!.teamId!;
      const rawItems = Array.isArray(req.body.items) ? req.body.items : [];

      const items: { memberId: string; amount: number }[] = [];
      for (const item of rawItems) {
        if (!item || typeof item.memberId !== 'string' || !Number.isFinite(Number(item.amount)) || Number(item.amount) < 0) {
          return res.status(400).json({ success: false, message: 'Each item must have a valid memberId and a non-negative amount' });
        }
        items.push({ memberId: item.memberId, amount: Number(item.amount) });
      }

      if (!items.length) {
        return res.status(400).json({ success: false, message: 'At least one item is required' });
      }

      const entryDate = dateFromString(String(req.body.entryDate));
      const month = await prisma.month.findFirst({
        where: { teamId, year: entryDate.getFullYear(), month: entryDate.getMonth() + 1, status: MonthStatus.OPEN }
      });
      if (!month) {
        return res.status(400).json({ success: false, message: 'Create an open month before saving daily entries' });
      }

      const memberIds = [...new Set(items.map((item) => item.memberId))];
      const members = await prisma.member.findMany({ where: { teamId, id: { in: memberIds }, status: 'active' } });
      if (members.length !== memberIds.length) {
        return res.status(400).json({ success: false, message: 'One or more members are not active' });
      }

      const remarks = req.body.remarks !== undefined && req.body.remarks !== null ? String(req.body.remarks).trim() : null;
      const totalCost = items.reduce((sum, item) => sum + item.amount, 0);

      const saved = await prisma.$transaction(async (tx) => {
        const existing = await tx.dailyEntry.findFirst({ where: { teamId, monthId: month.id, entryDate } });
        const entry = existing
          ? await tx.dailyEntry.update({ where: { id: existing.id }, data: { totalCost, remarks } })
          : await tx.dailyEntry.create({ data: { teamId, monthId: month.id, entryDate, totalCost, remarks } });

        await tx.entryItem.deleteMany({ where: { teamId, entryId: entry.id } });
        if (items.length) {
          await tx.entryItem.createMany({
            data: items.map((item) => ({
              teamId,
              entryId: entry.id,
              memberId: item.memberId,
              quantity: 1,
              price: item.amount,
              amount: item.amount
            }))
          });
        }
        return entry;
      });

      const savedItems = await prisma.entryItem.findMany({ where: { teamId, entryId: saved.id } });
      return res.status(201).json({
        success: true,
        data: { entry: { ...saved, totalCost: Number(saved.totalCost) }, items: savedItems.map(serializeItem) }
      });
    } catch (error) {
      return next(error);
    }
  }
);