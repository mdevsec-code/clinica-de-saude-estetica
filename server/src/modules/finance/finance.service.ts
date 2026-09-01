import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../utils/errors';
import type { ExpenseCategory } from '@prisma/client';

interface ListExpensesInput {
  tenantId: string;
  from?: string;
  to?: string;
}

export async function listExpenses({ tenantId, from, to }: ListExpensesInput) {
  const paidAt: Record<string, Date> = {};
  if (from) paidAt.gte = new Date(from);
  if (to) paidAt.lte = new Date(to);

  return prisma.expense.findMany({
    where: { tenantId, ...(from || to ? { paidAt } : {}) },
    orderBy: { paidAt: 'desc' },
  });
}

interface ExpenseInput {
  description: string;
  category: ExpenseCategory;
  amountCents: number;
  paidAt: string;
  notes?: string | null;
}

export async function createExpense(tenantId: string, input: ExpenseInput) {
  return prisma.expense.create({
    data: {
      tenantId,
      description: input.description,
      category: input.category,
      amountCents: input.amountCents,
      paidAt: new Date(input.paidAt),
      notes: input.notes ?? null,
    },
  });
}

export async function updateExpense(tenantId: string, id: string, input: Partial<ExpenseInput>) {
  const expense = await prisma.expense.findFirst({ where: { id, tenantId } });
  if (!expense) throw new NotFoundError('Gasto não encontrado.');

  return prisma.expense.update({
    where: { id },
    data: {
      description: input.description ?? undefined,
      category: input.category ?? undefined,
      amountCents: input.amountCents ?? undefined,
      paidAt: input.paidAt ? new Date(input.paidAt) : undefined,
      notes: input.notes === undefined ? undefined : input.notes,
    },
  });
}

export async function deleteExpense(tenantId: string, id: string) {
  const expense = await prisma.expense.findFirst({ where: { id, tenantId } });
  if (!expense) throw new NotFoundError('Gasto não encontrado.');
  await prisma.expense.delete({ where: { id } });
}
