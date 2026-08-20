import { Router } from 'express';
import { body, param } from 'express-validator';
import { MonthStatus, Role } from '@prisma/client';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { prisma } from '../config/prisma.js';
import { validate } from '../validators/validate.js';

export const monthRoutes = Router();
export const collectionRoutes = Router();

const parseMonthStatus = (value: unknown): MonthStatus | undefined => {
  if (value === undefined || value === null) return undefined;
  const status = String(value).trim().toUpperCase();
  if (status === 'OPEN') return MonthStatus.OPEN;
  if (status === 'LOCKED') return MonthStatus.LOCKED;
  return undefined;
};

const serializeMonth = (month: any) => ({
  ...month,
  openingCash: Number(month.openingCash),
  closingCash: Number(month.closingCash),
  status: String(month.status).toLowerCase()
});

const nextMonthFrom = (year: number, month: number) => {
  const date = new Date(year, month, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
};

monthRoutes.use(authMiddleware, requireRole(Role.TEAM_ADMIN, Role.SUPER_ADMIN));

monthRoutes.get('/', async (req: any, res: any, next: any) => {
  try {
    const teamId = req.user!.teamId!;
    const page = Math.max(0, Number(req.query.page) || 0);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
    const orderBy = ['year', 'month', 'createdAt'].includes(String(req.query.orderBy)) ? String(req.query.orderBy) : 'createdAt';
    const ascending = req.query.ascending === 'true';

    const [total, months] = await Promise.all([
      prisma.month.count({ where: { teamId } }),
      prisma.month.findMany({
        where: { teamId },
        orderBy: orderBy === 'year' ? [{ year: ascending ? 'asc' : 'desc' }, { month: ascending ? 'asc' : 'desc' }] : { [orderBy]: ascending ? 'asc' : 'desc' },
        skip: page * pageSize,
        take: pageSize
      })
    ]);

    return res.json({ success: true, data: months.map(serializeMonth), total, page, pageSize });
  } catch (error) {
    return next(error);
  }
});

monthRoutes.post(
  '/',
  [
    body('year').isInt({ min: 2000, max: 2200 }).withMessage('Valid year is required'),
    body('month').isInt({ min: 1, max: 12 }).withMessage('Valid month is required'),
    body('openingCash').optional().isNumeric().withMessage('Opening cash must be a number')
  ],
  validate,
  async (req: any, res: any, next: any) => {
    try {
      const teamId = req.user!.teamId!;
      const year = Number(req.body.year);
      const month = Number(req.body.month);
      const openingCash = Number(req.body.openingCash ?? 0);
      const openMonth = await prisma.month.findFirst({ where: { teamId, status: MonthStatus.OPEN } });
      if (openMonth) {
        return res.status(409).json({ success: false, message: 'Close the current open month before creating a new one' });
      }

      const created = await prisma.month.create({
        data: {
          teamId,
          year,
          month,
          openingCash,
          closingCash: Number(req.body.closingCash ?? openingCash),
          status: MonthStatus.OPEN
        }
      });

      return res.status(201).json({ success: true, data: serializeMonth(created) });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return res.status(409).json({ success: false, message: 'Month already exists' });
      }
      return next(error);
    }
  }
);

monthRoutes.post('/:id/close', [param('id').isString()], validate, async (req: any, res: any, next: any) => {
  try {
    const teamId = req.user!.teamId!;
    const result = await prisma.$transaction(async (tx) => {
      const month = await tx.month.findFirst({ where: { id: req.params.id, teamId } });
      if (!month) return null;

      const closed = await tx.month.update({
        where: { id: month.id },
        data: { status: MonthStatus.LOCKED, closedAt: new Date() }
      });

      const next = nextMonthFrom(month.year, month.month);
      const nextExists = await tx.month.findUnique({ where: { teamId_year_month: { teamId, year: next.year, month: next.month } } });
      if (nextExists) return { closed, nextMonth: nextExists };

      const nextMonth = await tx.month.create({
        data: {
          teamId,
          year: next.year,
          month: next.month,
          openingCash: closed.closingCash,
          closingCash: closed.closingCash,
          status: MonthStatus.OPEN
        }
      });
      return { closed, nextMonth };
    });

    if (!result) return res.status(404).json({ success: false, message: 'Month not found' });
    return res.json({ success: true, data: { closed: serializeMonth(result.closed), nextMonth: serializeMonth(result.nextMonth) } });
  } catch (error) {
    return next(error);
  }
});

monthRoutes.put('/:id', [param('id').isString()], validate, async (req: any, res: any, next: any) => {
  try {
    const teamId = req.user!.teamId!;
    const month = await prisma.month.findFirst({ where: { id: req.params.id, teamId } });
    if (!month) return res.status(404).json({ success: false, message: 'Month not found' });

    const status = parseMonthStatus(req.body.status);
    const updated = await prisma.month.update({
      where: { id: month.id },
      data: {
        ...(status ? { status } : {}),
        ...(req.body.closedAt === null ? { closedAt: null } : {}),
        ...(req.body.openingCash !== undefined ? { openingCash: Number(req.body.openingCash) } : {}),
        ...(req.body.closingCash !== undefined ? { closingCash: Number(req.body.closingCash) } : {})
      }
    });

    return res.json({ success: true, data: serializeMonth(updated) });
  } catch (error) {
    return next(error);
  }
});

monthRoutes.delete('/:id', [param('id').isString()], validate, async (req: any, res: any, next: any) => {
  try {
    const teamId = req.user!.teamId!;
    const month = await prisma.month.findFirst({ where: { id: req.params.id, teamId } });
    if (!month) return res.status(404).json({ success: false, message: 'Month not found' });

    await prisma.$transaction(async (tx) => {
      await tx.memberMonthBalance.deleteMany({ where: { teamId, monthId: month.id } });
      await tx.collection.deleteMany({ where: { teamId, monthId: month.id } });
      await tx.entryItem.deleteMany({ where: { teamId, entry: { monthId: month.id } } });
      await tx.dailyEntry.deleteMany({ where: { teamId, monthId: month.id } });
      await tx.expense.deleteMany({ where: { teamId, monthId: month.id } });
      await tx.month.delete({ where: { id: month.id } });
    });

    return res.json({ success: true, message: 'Month deleted' });
  } catch (error) {
    return next(error);
  }
});

collectionRoutes.use(authMiddleware, requireRole(Role.TEAM_ADMIN, Role.SUPER_ADMIN));

collectionRoutes.get('/', async (req: any, res: any, next: any) => {
  try {
    const teamId = req.user!.teamId!;
    const page = Math.max(0, Number(req.query.page) || 0);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
    const [total, collections] = await Promise.all([
      prisma.collection.count({ where: { teamId } }),
      prisma.collection.findMany({
        where: { teamId },
        include: { month: true },
        orderBy: { date: req.query.ascending === 'true' ? 'asc' : 'desc' },
        skip: page * pageSize,
        take: pageSize
      })
    ]);
    const memberIds = [...new Set(collections.map((row) => row.memberId))];
    const members = await prisma.member.findMany({ where: { teamId, id: { in: memberIds } } });
    const membersById = new Map(members.map((member) => [member.id, member]));

    return res.json({
      success: true,
      data: collections.map((row) => ({ ...row, amount: Number(row.amount), members: membersById.get(row.memberId) ?? null })),
      total,
      page,
      pageSize
    });
  } catch (error) {
    return next(error);
  }
});

collectionRoutes.post(
  '/',
  [
    body('memberId').isString().withMessage('Member is required'),
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
    body('date').isISO8601().withMessage('Valid date is required')
  ],
  validate,
  async (req: any, res: any, next: any) => {
    try {
      const teamId = req.user!.teamId!;
      const member = await prisma.member.findFirst({ where: { id: req.body.memberId, teamId, status: 'active' } });
      if (!member) return res.status(404).json({ success: false, message: 'Member not found' });

      const date = new Date(req.body.date);
      const month = await prisma.month.findFirst({
        where: { teamId, year: date.getFullYear(), month: date.getMonth() + 1, status: MonthStatus.OPEN }
      });
      if (!month) return res.status(400).json({ success: false, message: 'Create an open month before saving collections' });

      const collection = await prisma.collection.create({
        data: {
          teamId,
          memberId: member.id,
          monthId: month.id,
          amount: Number(req.body.amount),
          date,
          remarks: req.body.remarks ? String(req.body.remarks) : null
        },
        include: { month: true }
      });

      return res.status(201).json({ success: true, data: { ...collection, amount: Number(collection.amount), members: member } });
    } catch (error) {
      return next(error);
    }
  }
);
