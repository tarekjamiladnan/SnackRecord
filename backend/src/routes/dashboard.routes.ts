import { Router } from 'express';
import { Role } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';
import { prisma } from '../config/prisma.js';

export const dashboardRoutes = Router();

dashboardRoutes.use(authMiddleware);

dashboardRoutes.get('/', async (req: any, res: any, next: any) => {
  try {
    if (req.user?.role === Role.SUPER_ADMIN && !req.user.teamId) {
      return res.json({ success: true, data: { members: [], entries: [] } });
    }

    const teamId = req.user!.teamId!;
    const [members, collections, allEntries] = await Promise.all([
      prisma.member.findMany({ where: { teamId, status: 'active' }, orderBy: { name: 'asc' } }),
      prisma.collection.findMany({ where: { teamId } }),
      prisma.dailyEntry.findMany({
        where: { teamId },
        include: { items: true },
        orderBy: { entryDate: 'desc' }
      })
    ]);

    const entries = allEntries.slice(0, 10);

    const memberIds = members.map((member) => member.id);
    const usedByMember = new Map(memberIds.map((id) => [id, 0]));
    for (const entry of allEntries) {
      for (const item of entry.items) {
        usedByMember.set(item.memberId, (usedByMember.get(item.memberId) ?? 0) + Number(item.amount));
      }
    }

    const givenByMember = new Map(memberIds.map((id) => [id, 0]));
    for (const collection of collections) {
      givenByMember.set(collection.memberId, (givenByMember.get(collection.memberId) ?? 0) + Number(collection.amount));
    }

    const memberRows = members.map((member) => {
      const given = givenByMember.get(member.id) ?? 0;
      const used = usedByMember.get(member.id) ?? 0;
      return {
        id: member.id,
        userId: member.userId,
        email: member.email,
        name: member.name,
        given,
        used,
        left: given - used
      };
    });

    const membersById = new Map(members.map((member) => [member.id, member]));
    const entryRows = entries.map((entry) => ({
      id: entry.id,
      date: entry.entryDate.toISOString().slice(0, 10),
      remarks: entry.remarks,
      total: Number(entry.totalCost),
      items: entry.items.map((item) => ({
        name: membersById.get(item.memberId)?.name ?? 'Member',
        amount: Number(item.amount)
      }))
    }));

    return res.json({ success: true, data: { members: memberRows, entries: entryRows } });
  } catch (error) {
    return next(error);
  }
});
