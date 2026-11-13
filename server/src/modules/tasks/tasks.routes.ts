import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler';
import { NotFoundError } from '../../utils/errors';
import { prisma } from '../../lib/prisma';
import { requireAuth, requireRole } from '../auth/auth.middleware';

// Quadro de tarefas da semana (Painel → Tarefas): um quadro só, dividido
// entre a Noely e a recepção. Cada tarefa é de um dia (data sem hora).
export const tasksRouter = Router();
tasksRouter.use(requireAuth, requireRole('ADMIN', 'RECEPTION'));

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');
const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
const select = { id: true, date: true, title: true, done: true, position: true, createdByName: true, updatedAt: true } as const;

tasksRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { from, to } = z.object({ from: day, to: day }).parse(req.query);
    const tasks = await prisma.task.findMany({
      where: { tenantId: req.tenant.id, date: { gte: toDate(from), lte: toDate(to) } },
      orderBy: [{ date: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
      select,
    });
    res.json({ tasks });
  }),
);

tasksRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { date, title } = z.object({ date: day, title: z.string().trim().min(1).max(300) }).parse(req.body);
    const last = await prisma.task.findFirst({ where: { tenantId: req.tenant.id, date: toDate(date) }, orderBy: { position: 'desc' } });
    const task = await prisma.task.create({
      data: { tenantId: req.tenant.id, date: toDate(date), title, position: (last?.position ?? 0) + 1, createdByName: req.user!.name },
      select,
    });
    res.status(201).json({ task });
  }),
);

tasksRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = z
      .object({ title: z.string().trim().min(1).max(300).optional(), done: z.boolean().optional(), date: day.optional(), position: z.number().int().optional() })
      .parse(req.body);
    const { count } = await prisma.task.updateMany({
      where: { id: req.params.id, tenantId: req.tenant.id },
      data: { ...input, ...(input.date ? { date: toDate(input.date) } : {}) },
    });
    if (!count) throw new NotFoundError('Tarefa não encontrada.');
    res.json({ task: await prisma.task.findUnique({ where: { id: req.params.id }, select }) });
  }),
);

tasksRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { count } = await prisma.task.deleteMany({ where: { id: req.params.id, tenantId: req.tenant.id } });
    if (!count) throw new NotFoundError('Tarefa não encontrada.');
    res.status(204).end();
  }),
);
