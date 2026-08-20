import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { prisma } from '../config/prisma.js';

export const reportRoutes = Router();

reportRoutes.use(authMiddleware);

reportRoutes.get('/summary', async (req, res, next) => {
  try {
    const teamId = req.user!.teamId!;
    const [snacks, records, members] = await Promise.all([
      prisma.snack.count({ where: { teamId } }),
      prisma.snackRecord.count({ where: { teamId } }),
      prisma.member.count({ where: { teamId } })
    ]);

    res.json({
      success: true,
      summary: {
        teamId,
        snacks,
        records,
        members
      }
    });
  } catch (error) {
    next(error);
  }
});

reportRoutes.get('/monthly', async (req: any, res: any, next: any) => {
  try {
    const teamId = req.user!.teamId!;
    const year = Number(req.query.year) || new Date().getFullYear();
    const monthNumber = Number(req.query.month) || new Date().getMonth() + 1;

    const month = await prisma.month.findUnique({
      where: { teamId_year_month: { teamId, year, month: monthNumber } }
    });

    const members = await prisma.member.findMany({
      where: { teamId, status: 'active' },
      orderBy: { name: 'asc' }
    });

    if (!month) {
      return res.json({
        success: true,
        data: members.map((member) => ({
          person: member.name,
          opening: 0,
          given: 0,
          used: 0,
          left: 0
        }))
      });
    }

    const [collections, items, balances] = await Promise.all([
      prisma.collection.findMany({ where: { teamId, monthId: month.id } }),
      prisma.entryItem.findMany({ where: { teamId, entry: { monthId: month.id } } }),
      prisma.memberMonthBalance.findMany({ where: { teamId, monthId: month.id } })
    ]);

    const givenByMember = new Map(members.map((member) => [member.id, 0]));
    for (const collection of collections) {
      givenByMember.set(collection.memberId, (givenByMember.get(collection.memberId) ?? 0) + Number(collection.amount));
    }

    const usedByMember = new Map(members.map((member) => [member.id, 0]));
    for (const item of items) {
      usedByMember.set(item.memberId, (usedByMember.get(item.memberId) ?? 0) + Number(item.amount));
    }

    const openingByMember = new Map(balances.map((balance) => [balance.memberId, Number(balance.openingBalance)]));
    const rows = members.map((member) => {
      const opening = openingByMember.get(member.id) ?? 0;
      const given = givenByMember.get(member.id) ?? 0;
      const used = usedByMember.get(member.id) ?? 0;
      return {
        person: member.name,
        opening,
        given,
        used,
        left: opening + given - used
      };
    });

    return res.json({ success: true, data: rows });
  } catch (error) {
    return next(error);
  }
});
