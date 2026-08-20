import { Router } from 'express';
import { body, param } from 'express-validator';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { prisma } from '../config/prisma.js';
import { validate } from '../validators/validate.js';
import { Role } from '@prisma/client';

export const snackRecordRoutes = Router();

snackRecordRoutes.use(authMiddleware, requireRole(Role.TEAM_ADMIN, Role.SUPER_ADMIN));

snackRecordRoutes.get('/', async (req: any, res: any, next: any) => {
  try {
    const records = await prisma.snackRecord.findMany({
      where: { teamId: req.user!.teamId! },
      include: { snack: true, user: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, records });
  } catch (error) {
    next(error);
  }
});

snackRecordRoutes.post(
  '/',
  [
    body('snackId').isString().withMessage('Snack ID is required'),
    body('quantity').isNumeric().withMessage('Quantity is required'),
    body('amount').isNumeric().withMessage('Amount is required')
  ],
  validate,
  async (req: any, res: any, next: any) => {
    try {
      const teamId = req.user!.teamId!;
      const snack = await prisma.snack.findFirst({ where: { id: req.body.snackId, teamId } });
      if (!snack) return res.status(404).json({ success: false, message: 'Snack not found' });

      const record = await prisma.snackRecord.create({
        data: {
          teamId,
          snackId: snack.id,
          userId: req.user!.id,
          quantity: Number(req.body.quantity),
          amount: Number(req.body.amount),
          notes: req.body.notes || null
        },
        include: { snack: true, user: true }
      });
      res.status(201).json({ success: true, record });
    } catch (error) {
      next(error);
    }
  }
);

snackRecordRoutes.patch('/:id', [param('id').isString()], validate, async (req: any, res: any, next: any) => {
  try {
    const record = await prisma.snackRecord.findFirst({ where: { id: req.params.id, teamId: req.user!.teamId! } });
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    const updated = await prisma.snackRecord.update({
      where: { id: record.id },
      data: {
        ...(req.body.quantity !== undefined ? { quantity: Number(req.body.quantity) } : {}),
        ...(req.body.amount !== undefined ? { amount: Number(req.body.amount) } : {}),
        ...(req.body.notes !== undefined ? { notes: String(req.body.notes) } : {})
      },
      include: { snack: true, user: true }
    });
    res.json({ success: true, record: updated });
  } catch (error) {
    next(error);
  }
});

snackRecordRoutes.delete('/:id', [param('id').isString()], validate, async (req: any, res: any, next: any) => {
  try {
    const record = await prisma.snackRecord.findFirst({ where: { id: req.params.id, teamId: req.user!.teamId! } });
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    await prisma.snackRecord.delete({ where: { id: record.id } });
    res.json({ success: true, message: 'Record deleted' });
  } catch (error) {
    next(error);
  }
});
