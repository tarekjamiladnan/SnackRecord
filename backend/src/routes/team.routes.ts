import { Router } from 'express';
import { body, param } from 'express-validator';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { prisma } from '../config/prisma.js';
import { validate } from '../validators/validate.js';
import { Role, MonthStatus } from '@prisma/client';

export const teamRoutes = Router();
export const memberRoutes = Router();

teamRoutes.use(authMiddleware);
teamRoutes.use((req: any, res: any, next: any) => {
  if (req.user?.role === Role.SUPER_ADMIN) return next();
  if (req.user?.teamId) return next();
  return res.status(403).json({ success: false, message: 'Team access required' });
});

teamRoutes.get('/', async (req: any, res: any, next: any) => {
  try {
    const team = await prisma.team.findUnique({
      where: { id: req.user!.teamId || '' },
      include: {
        users: {
          select: { id: true, name: true, email: true, role: true, teamId: true }
        }
      }
    });
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }
    return res.json({ success: true, team });
  } catch (error) {
    return next(error);
  }
});

const listMembers = async (req: any, res: any, next: any) => {
  try {
    const teamId = req.user!.teamId!;
    const page = Math.max(0, Number(req.query.page) || 0);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
    const search = String(req.query.search || '').trim();
    const orderBy = String(req.query.orderBy || 'createdAt') === 'name' ? 'name' : 'createdAt';
    const ascending = req.query.ascending === 'true';
    const activeOnly = req.query.status !== 'all';

    const where: any = { teamId };
    if (activeOnly) where.status = 'active';
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [total, members] = await Promise.all([
      prisma.member.count({ where }),
      prisma.member.findMany({
        where,
        orderBy: { [orderBy]: ascending ? 'asc' : 'desc' },
        skip: page * pageSize,
        take: pageSize
      })
    ]);

    return res.json({ success: true, data: members, total, page, pageSize });
  } catch (error) {
    return next(error);
  }
};

const createMemberValidators = [
  body('name').isString().isLength({ min: 2 }).withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('phone').optional({ values: 'falsy' }).isString().withMessage('Phone is invalid'),
  body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
];

const createMember = async (req: any, res: any, next: any) => {
  try {
    const teamId = req.user!.teamId!;
    const password = req.body.password || 'Welcome123';
    const name = String(req.body.name).trim();
    const email = String(req.body.email).trim().toLowerCase();
    const phone = String(req.body.phone || '').trim() || null;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'A user with that email already exists' });
    }

    const existingMember = await prisma.member.findUnique({ where: { teamId_email: { teamId, email } } });
    if (existingMember) {
      return res.status(409).json({ success: false, message: 'A member with that email already exists' });
    }

    const user = await prisma.user.create({
      data: {
        teamId,
        name,
        email,
        phone,
        passwordHash: await import('bcryptjs').then(({ default: bcrypt }) => bcrypt.hash(password, 12)),
        role: Role.MEMBER
      }
    });

    const member = await prisma.member.create({
      data: {
        teamId,
        userId: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        status: 'active'
      }
    });

    return res.status(201).json({ success: true, data: member });
  } catch (error) {
    return next(error);
  }
};

teamRoutes.get('/members', listMembers);

teamRoutes.post(
  '/members',
  createMemberValidators,
  validate,
  requireRole(Role.TEAM_ADMIN),
  createMember
);

memberRoutes.use(authMiddleware);
memberRoutes.use((req: any, res: any, next: any) => {
  if (req.user?.teamId) return next();
  return res.status(403).json({ success: false, message: 'Team access required' });
});

memberRoutes.get('/', listMembers);

memberRoutes.get('/:id/balance', [param('id').isString()], validate, async (req: any, res: any, next: any) => {
  try {
    const teamId = req.user!.teamId!;
    const member = await prisma.member.findFirst({ where: { id: req.params.id, teamId } });
    if (!member) return res.status(404).json({ success: false, message: 'Member not found' });

    let balance = 0;
    const month = await prisma.month.findFirst({ where: { teamId, status: MonthStatus.OPEN } });
    if (month) {
      const [opening, given, used] = await Promise.all([
        prisma.memberMonthBalance.findMany({ where: { teamId, memberId: member.id, monthId: month.id } }),
        prisma.collection.aggregate({ where: { teamId, memberId: member.id, monthId: month.id }, _sum: { amount: true } }),
        prisma.entryItem.aggregate({ where: { teamId, memberId: member.id, entry: { monthId: month.id } }, _sum: { amount: true } })
      ]);
      const openingBalance = Number(opening[0]?.openingBalance ?? 0);
      const givenAmount = Number(given._sum.amount ?? 0);
      const usedAmount = Number(used._sum.amount ?? 0);
      balance = openingBalance + givenAmount - usedAmount;
    }

    return res.json({ success: true, data: { memberId: member.id, balance } });
  } catch (error) {
    return next(error);
  }
});

memberRoutes.post(
  '/',
  createMemberValidators,
  validate,
  requireRole(Role.TEAM_ADMIN),
  createMember
);

memberRoutes.put(
  '/:id',
  [
    param('id').isString(),
    body('name').optional().isString().isLength({ min: 2 }),
    body('email').optional().isEmail(),
    body('phone').optional({ values: 'falsy' }).isString()
  ],
  validate,
  requireRole(Role.TEAM_ADMIN),
  async (req: any, res: any, next: any) => {
    try {
      const teamId = req.user!.teamId!;
      const member = await prisma.member.findFirst({ where: { id: req.params.id, teamId } });
      if (!member) {
        return res.status(404).json({ success: false, message: 'Member not found' });
      }

      const data: any = {};
      if (req.body.name !== undefined) data.name = String(req.body.name).trim();
      if (req.body.phone !== undefined) data.phone = String(req.body.phone || '').trim() || null;
      if (req.body.status !== undefined && ['active', 'archived'].includes(req.body.status)) data.status = req.body.status;

      if (req.body.email !== undefined) {
        const email = String(req.body.email).trim().toLowerCase();
        const conflict = await prisma.member.findFirst({
          where: { teamId, email, NOT: { id: member.id } }
        });
        if (conflict) {
          return res.status(409).json({ success: false, message: 'A member with that email already exists' });
        }
        data.email = email;
      }

      const updated = await prisma.member.update({ where: { id: member.id }, data });

      if (member.userId) {
        const userData: any = {};
        if (data.name) userData.name = data.name;
        if (data.email) userData.email = data.email;
        if (data.phone !== undefined) userData.phone = data.phone;
        if (Object.keys(userData).length) {
          await prisma.user.update({ where: { id: member.userId }, data: userData });
        }
      }

      return res.json({ success: true, data: updated });
    } catch (error) {
      return next(error);
    }
  }
);

memberRoutes.delete('/:id', [param('id').isString()], validate, requireRole(Role.TEAM_ADMIN), async (req: any, res: any, next: any) => {
  try {
    const teamId = req.user!.teamId!;
    const member = await prisma.member.findFirst({ where: { id: req.params.id, teamId } });
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }
    const updated = await prisma.member.update({ where: { id: member.id }, data: { status: 'archived' } });
    return res.json({ success: true, data: updated });
  } catch (error) {
    return next(error);
  }
});

teamRoutes.put(
  '/members/:id',
  [
    param('id').isString(),
    body('name').optional().isString().isLength({ min: 2 }),
    body('email').optional().isEmail(),
    body('phone').optional({ values: 'falsy' }).isString()
  ],
  validate,
  requireRole(Role.TEAM_ADMIN),
  async (req: any, res: any, next: any) => {
    try {
      const teamId = req.user!.teamId!;
      const member = await prisma.member.findFirst({ where: { id: req.params.id, teamId } });
      if (!member) {
        return res.status(404).json({ success: false, message: 'Member not found' });
      }

      const data: any = {};
      if (req.body.name !== undefined) data.name = String(req.body.name).trim();
      if (req.body.phone !== undefined) data.phone = String(req.body.phone || '').trim() || null;
      if (req.body.status !== undefined && ['active', 'archived'].includes(req.body.status)) data.status = req.body.status;

      if (req.body.email !== undefined) {
        const email = String(req.body.email).trim().toLowerCase();
        const conflict = await prisma.member.findFirst({
          where: { teamId, email, NOT: { id: member.id } }
        });
        if (conflict) {
          return res.status(409).json({ success: false, message: 'A member with that email already exists' });
        }
        data.email = email;
      }

      const updated = await prisma.member.update({ where: { id: member.id }, data });

      if (member.userId) {
        const userData: any = {};
        if (data.name) userData.name = data.name;
        if (data.email) userData.email = data.email;
        if (data.phone !== undefined) userData.phone = data.phone;
        if (Object.keys(userData).length) {
          await prisma.user.update({ where: { id: member.userId }, data: userData });
        }
      }

      return res.json({ success: true, data: updated });
    } catch (error) {
      return next(error);
    }
  }
);

teamRoutes.delete('/members/:id', [param('id').isString()], validate, requireRole(Role.TEAM_ADMIN), async (req: any, res: any, next: any) => {
  try {
    const teamId = req.user!.teamId!;
    const member = await prisma.member.findFirst({ where: { id: req.params.id, teamId } });
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }
    const updated = await prisma.member.update({ where: { id: member.id }, data: { status: 'archived' } });
    return res.json({ success: true, data: updated });
  } catch (error) {
    return next(error);
  }
});
