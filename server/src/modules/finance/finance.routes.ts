import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import { createExpense, deleteExpense, listExpenses, updateExpense } from './finance.service';

export const financeRouter = Router();
financeRouter.use(requireAuth, requireRole('ADMIN', 'RECEPTION'));

const EXPENSE_CATEGORIES = ['PRODUTOS', 'EQUIPAMENTOS', 'ALUGUEL', 'MARKETING', 'SALARIOS', 'OUTROS'] as const;

const listQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

financeRouter.get(
  '/expenses',
  asyncHandler(async (req, res) => {
    const { from, to } = listQuerySchema.parse(req.query);
    const expenses = await listExpenses({ tenantId: req.tenant.id, from, to });
    res.json({ expenses });
  }),
);

const expenseInputSchema = z.object({
  description: z.string().min(2, 'Descreva o gasto.'),
  category: z.enum(EXPENSE_CATEGORIES),
  amountCents: z.number().int().min(1, 'Informe um valor maior que zero.'),
  paidAt: z.string().min(1),
  notes: z.string().max(500).nullable().optional(),
});

financeRouter.post(
  '/expenses',
  asyncHandler(async (req, res) => {
    const input = expenseInputSchema.parse(req.body);
    const expense = await createExpense(req.tenant.id, input);
    res.status(201).json({ expense });
  }),
);

const expenseUpdateSchema = expenseInputSchema.partial();

financeRouter.patch(
  '/expenses/:id',
  asyncHandler(async (req, res) => {
    const input = expenseUpdateSchema.parse(req.body);
    const expense = await updateExpense(req.tenant.id, req.params.id, input);
    res.json({ expense });
  }),
);

financeRouter.delete(
  '/expenses/:id',
  asyncHandler(async (req, res) => {
    await deleteExpense(req.tenant.id, req.params.id);
    res.status(204).send();
  }),
);
