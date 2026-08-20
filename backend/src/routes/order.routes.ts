import { Router } from 'express';
import { body, param } from 'express-validator';
import { MonthStatus, Role } from '@prisma/client';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { prisma } from '../config/prisma.js';
import { validate } from '../validators/validate.js';

export const orderRoutes = Router();
export const orderRequestRoutes = Router();

orderRoutes.use(authMiddleware);
orderRoutes.use((req: any, res: any, next: any) => {
  if (req.user?.teamId) return next();
  return res.status(403).json({ success: false, message: 'Team access required' });
});

orderRequestRoutes.use(authMiddleware);
orderRequestRoutes.use((req: any, res: any, next: any) => {
  if (req.user?.teamId) return next();
  return res.status(403).json({ success: false, message: 'Team access required' });
});

const toDate = (value: unknown): string | null => {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
};

const dateFromString = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

const findMemberByUser = async (teamId: string, userId: string) =>
  prisma.member.findFirst({ where: { teamId, userId } });

const serializeSettings = (settings: any) => ({
  ...settings,
  minBalanceEnabled: settings.minBalanceEnabled ?? false,
  minBalanceAmount: Number(settings.minBalanceAmount ?? 20),
  orderClosingTime: settings.orderClosingTime || '16:20'
});

orderRoutes.get('/member-info', async (req: any, res: any, next: any) => {
  try {
    const teamId = req.user!.teamId!;
    const dateStr = toDate(req.query.date) ?? toDate(new Date());
    const date = dateFromString(dateStr!);
    const member = await findMemberByUser(teamId, req.user!.id);
    const settings = await prisma.teamSetting.upsert({ where: { teamId }, update: {}, create: { teamId } });
    let order = null;
    let request = null;
    if (member) {
      [order, request] = await Promise.all([
        prisma.order.findFirst({ where: { teamId, memberId: member.id, orderDate: date } }),
        prisma.orderRequest.findFirst({ where: { teamId, memberId: member.id, requestDate: date } })
      ]);
    }
    return res.json({ success: true, data: { member, settings: serializeSettings(settings), order, request } });
  } catch (error) {
    return next(error);
  }
});

orderRoutes.get('/', async (req: any, res: any, next: any) => {
  try {
    const teamId = req.user!.teamId!;
    const dateStr = toDate(req.query.date) ?? toDate(new Date());
    const date = dateFromString(dateStr!);
    const search = String(req.query.search || '').trim();
    const page = Math.max(0, Number(req.query.page) || 0);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));

    const [total, orders] = await Promise.all([
      prisma.order.count({ where: { teamId, orderDate: date } }),
      prisma.order.findMany({
        where: { teamId, orderDate: date },
        orderBy: { createdAt: 'desc' },
        skip: page * pageSize,
        take: pageSize
      })
    ]);

    const memberIds = [...new Set(orders.map((order) => order.memberId))];
    const members = await prisma.member.findMany({
      where: { id: { in: memberIds } },
      select: { id: true, name: true, email: true }
    });
    const memberById = new Map(members.map((member) => [member.id, member]));

    let rows = orders.map((order) => ({ ...order, member: memberById.get(order.memberId) ?? null }));
    if (search) {
      rows = rows.filter((row) => (row.member?.name ?? '').toLowerCase().includes(search.toLowerCase()));
    }

    return res.json({ success: true, data: rows, total: search ? rows.length : total, page, pageSize });
  } catch (error) {
    return next(error);
  }
});

orderRoutes.post(
  '/',
  [
    body('orderText').isString().isLength({ min: 1, max: 500 }).withMessage('Order text is required'),
    body('orderDate').optional().isString().withMessage('Order date is invalid')
  ],
  validate,
  requireRole(Role.TEAM_ADMIN, Role.MEMBER),
  async (req: any, res: any, next: any) => {
    try {
      const teamId = req.user!.teamId!;
      const member = await findMemberByUser(teamId, req.user!.id);
      if (!member) return res.status(404).json({ success: false, message: 'Member profile not found' });

      const dateStr = toDate(req.body.orderDate) ?? toDate(new Date());
      const date = dateFromString(dateStr!);
      const orderText = String(req.body.orderText).trim();

      const settings = await prisma.teamSetting.upsert({ where: { teamId }, update: {}, create: { teamId } });
      const closingTime = settings.orderClosingTime || '16:20';
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const afterCutoff = `${hh}:${mm}` >= closingTime;
      const approved = await prisma.orderRequest.findFirst({ where: { teamId, memberId: member.id, requestDate: date, status: 'approved' } });
      if (afterCutoff && !approved) {
        return res.status(409).json({
          success: false,
          message: `Ordering closed at ${closingTime}. Request permission from the admin to place an order.`
        });
      }

      if (settings.minBalanceEnabled) {
        const minBalance = Number(settings.minBalanceAmount ?? 20);
        const openMonth = await prisma.month.findFirst({ where: { teamId, status: MonthStatus.OPEN } });
        const [opening, given, used] = await Promise.all([
          prisma.memberMonthBalance.findMany({ where: { teamId, memberId: member.id, monthId: openMonth?.id ?? '' } }),
          prisma.collection.aggregate({ where: { teamId, memberId: member.id, monthId: openMonth?.id ?? '' }, _sum: { amount: true } }),
          prisma.entryItem.aggregate({ where: { teamId, memberId: member.id, entry: { monthId: openMonth?.id ?? '' } }, _sum: { amount: true } })
        ]);
        const balance =
          Number(openMonth ? (opening[0]?.openingBalance ?? 0) : 0) +
          Number(given._sum.amount ?? 0) -
          Number(used._sum.amount ?? 0);
        if (balance < minBalance) {
          return res.status(409).json({
            success: false,
            message: `Your balance is below the minimum of ${minBalance} required to place an order. Please pay the admin first.`
          });
        }
      }

      const existing = await prisma.order.findFirst({ where: { teamId, memberId: member.id, orderDate: date } });
      const order = existing
        ? await prisma.order.update({ where: { id: existing.id }, data: { orderText } })
        : await prisma.order.create({ data: { teamId, memberId: member.id, orderDate: date, orderText } });

      return res.status(existing ? 200 : 201).json({ success: true, data: order });
    } catch (error) {
      return next(error);
    }
  }
);

orderRoutes.put(
  '/:id',
  [
    param('id').isString(),
    body('orderText').optional().isString().isLength({ min: 1, max: 500 }).withMessage('Order text is required')
  ],
  validate,
  requireRole(Role.TEAM_ADMIN),
  async (req: any, res: any, next: any) => {
    try {
      const teamId = req.user!.teamId!;
      const order = await prisma.order.findFirst({ where: { id: req.params.id, teamId } });
      if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
      const updated = await prisma.order.update({
        where: { id: order.id },
        data: req.body.orderText !== undefined ? { orderText: String(req.body.orderText).trim() } : {}
      });
      return res.json({ success: true, data: updated });
    } catch (error) {
      return next(error);
    }
  }
);

orderRoutes.delete('/:id', [param('id').isString()], validate, requireRole(Role.TEAM_ADMIN), async (req: any, res: any, next: any) => {
  try {
    const teamId = req.user!.teamId!;
    const order = await prisma.order.findFirst({ where: { id: req.params.id, teamId } });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    await prisma.order.delete({ where: { id: order.id } });
    return res.json({ success: true, message: 'Order deleted' });
  } catch (error) {
    return next(error);
  }
});

orderRequestRoutes.get('/', async (req: any, res: any, next: any) => {
  try {
    const teamId = req.user!.teamId!;
    const dateStr = toDate(req.query.date) ?? toDate(new Date());
    const date = dateFromString(dateStr!);
    const requests = await prisma.orderRequest.findMany({
      where: { teamId, requestDate: date },
      orderBy: { createdAt: 'desc' }
    });
    const memberIds = [...new Set(requests.map((request) => request.memberId))];
    const members = await prisma.member.findMany({
      where: { id: { in: memberIds } },
      select: { id: true, name: true, email: true }
    });
    const memberById = new Map(members.map((member) => [member.id, member]));
    const rows = requests.map((request) => ({ ...request, member: memberById.get(request.memberId) ?? null }));
    return res.json({ success: true, data: rows, total: rows.length, page: 0, pageSize: rows.length });
  } catch (error) {
    return next(error);
  }
});

orderRequestRoutes.post(
  '/',
  [body('requestDate').optional().isString().withMessage('Request date is invalid')],
  validate,
  requireRole(Role.TEAM_ADMIN, Role.MEMBER),
  async (req: any, res: any, next: any) => {
    try {
      const teamId = req.user!.teamId!;
      const member = await findMemberByUser(teamId, req.user!.id);
      if (!member) return res.status(404).json({ success: false, message: 'Member profile not found' });

      const dateStr = toDate(req.body.requestDate) ?? toDate(new Date());
      const date = dateFromString(dateStr!);

      const existing = await prisma.orderRequest.findFirst({ where: { teamId, memberId: member.id, requestDate: date } });
      const request = existing
        ? existing.status === 'rejected'
          ? await prisma.orderRequest.update({ where: { id: existing.id }, data: { status: 'pending' } })
          : existing
        : await prisma.orderRequest.create({ data: { teamId, memberId: member.id, requestDate: date, status: 'pending' } });

      return res.status(request?.id === existing?.id && existing ? 200 : 201).json({ success: true, data: request });
    } catch (error) {
      return next(error);
    }
  }
);

orderRequestRoutes.put(
  '/:id',
  [param('id').isString(), body('status').isIn(['approved', 'rejected']).withMessage('Status is invalid')],
  validate,
  requireRole(Role.TEAM_ADMIN),
  async (req: any, res: any, next: any) => {
    try {
      const teamId = req.user!.teamId!;
      const request = await prisma.orderRequest.findFirst({ where: { id: req.params.id, teamId } });
      if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
      const updated = await prisma.orderRequest.update({
        where: { id: request.id },
        data: { status: String(req.body.status) }
      });
      return res.json({ success: true, data: updated });
    } catch (error) {
      return next(error);
    }
  }
);