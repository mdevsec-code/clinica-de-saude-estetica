import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import {
  createExpense,
  deleteExpense,
  getDailyRevenueHistory,
  getDre,
  getTodaySummary,
  ignoreBankTransaction,
  importBankStatement,
  listBankTransactions,
  listExpenses,
  markExpensePaid,
  matchBankTransaction,
  suggestMatches,
  unmatchBankTransaction,
  updateExpense,
} from './finance.service';

export const financeRouter = Router();
financeRouter.use(requireAuth, requireRole('ADMIN', 'RECEPTION'));

const EXPENSE_CATEGORIES = ['PRODUTOS', 'EQUIPAMENTOS', 'ALUGUEL', 'MARKETING', 'SALARIOS', 'OUTROS'] as const;
const EXPENSE_STATUSES = ['PENDING', 'PAID'] as const;
const BANK_TXN_STATUSES = ['UNMATCHED', 'MATCHED', 'IGNORED'] as const;

const listQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  status: z.enum(EXPENSE_STATUSES).optional(),
});

financeRouter.get(
  '/expenses',
  asyncHandler(async (req, res) => {
    const { from, to, status } = listQuerySchema.parse(req.query);
    const expenses = await listExpenses({ tenantId: req.tenant.id, from, to, status });
    res.json({ expenses });
  }),
);

const expenseInputSchema = z.object({
  description: z.string().min(2, 'Descreva o gasto.'),
  category: z.enum(EXPENSE_CATEGORIES),
  amountCents: z.number().int().min(1, 'Informe um valor maior que zero.'),
  status: z.enum(EXPENSE_STATUSES).default('PAID'),
  dueAt: z.string().nullable().optional(),
  paidAt: z.string().nullable().optional(),
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

const markPaidSchema = z.object({
  paidAt: z.string().min(1),
});

financeRouter.post(
  '/expenses/:id/pay',
  asyncHandler(async (req, res) => {
    const { paidAt } = markPaidSchema.parse(req.body);
    const expense = await markExpensePaid(req.tenant.id, req.params.id, paidAt);
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

financeRouter.get(
  '/today-summary',
  asyncHandler(async (req, res) => {
    const summary = await getTodaySummary(req.tenant.id);
    res.json(summary);
  }),
);

const revenueDailyQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(180).default(30),
});

financeRouter.get(
  '/revenue-daily',
  asyncHandler(async (req, res) => {
    const { days } = revenueDailyQuerySchema.parse(req.query);
    const history = await getDailyRevenueHistory(req.tenant.id, days);
    res.json(history);
  }),
);

const dreQuerySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

financeRouter.get(
  '/dre',
  asyncHandler(async (req, res) => {
    const { from, to } = dreQuerySchema.parse(req.query);
    const dre = await getDre({ tenantId: req.tenant.id, from, to });
    res.json(dre);
  }),
);

// --- Conciliação bancária ---
// Só ADMIN (não RECEPÇÃO): importar extrato e conciliar mexe diretamente na
// baixa automática de gastos (ver matchBankTransaction) — mesmo nível de
// acesso restrito de qualquer ação financeira estrutural do sistema.
const bankAdminOnly = requireRole('ADMIN');

const importSchema = z.object({
  content: z.string().min(1, 'Envie o conteúdo do arquivo OFX.'),
});

financeRouter.post(
  '/bank/import',
  bankAdminOnly,
  asyncHandler(async (req, res) => {
    const { content } = importSchema.parse(req.body);
    const result = await importBankStatement(req.tenant.id, content);
    res.status(201).json(result);
  }),
);

const bankListQuerySchema = z.object({
  status: z.enum(BANK_TXN_STATUSES).optional(),
});

financeRouter.get(
  '/bank/transactions',
  asyncHandler(async (req, res) => {
    const { status } = bankListQuerySchema.parse(req.query);
    const transactions = await listBankTransactions({ tenantId: req.tenant.id, status });
    res.json({ transactions });
  }),
);

financeRouter.get(
  '/bank/transactions/:id/suggestions',
  asyncHandler(async (req, res) => {
    const suggestions = await suggestMatches(req.tenant.id, req.params.id);
    res.json({ suggestions });
  }),
);

const matchSchema = z.object({
  expenseId: z.string().min(1),
});

financeRouter.post(
  '/bank/transactions/:id/match',
  bankAdminOnly,
  asyncHandler(async (req, res) => {
    const { expenseId } = matchSchema.parse(req.body);
    const transaction = await matchBankTransaction(req.tenant.id, req.params.id, expenseId);
    res.json({ transaction });
  }),
);

financeRouter.post(
  '/bank/transactions/:id/unmatch',
  bankAdminOnly,
  asyncHandler(async (req, res) => {
    const transaction = await unmatchBankTransaction(req.tenant.id, req.params.id);
    res.json({ transaction });
  }),
);

financeRouter.post(
  '/bank/transactions/:id/ignore',
  bankAdminOnly,
  asyncHandler(async (req, res) => {
    const transaction = await ignoreBankTransaction(req.tenant.id, req.params.id);
    res.json({ transaction });
  }),
);
