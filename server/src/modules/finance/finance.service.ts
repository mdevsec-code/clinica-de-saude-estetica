import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { prisma } from '../../lib/prisma';
import { AppError, NotFoundError } from '../../utils/errors';
import { parseOfx } from './ofx-parser';
import type { BankTransactionStatus, ExpenseCategory, ExpenseStatus } from '@prisma/client';

interface ListExpensesInput {
  tenantId: string;
  from?: string;
  to?: string;
  status?: ExpenseStatus;
}

export async function listExpenses({ tenantId, from, to, status }: ListExpensesInput) {
  const paidAt: Record<string, Date> = {};
  if (from) paidAt.gte = new Date(from);
  if (to) paidAt.lte = new Date(to);

  return prisma.expense.findMany({
    where: { tenantId, ...(status ? { status } : {}), ...(from || to ? { paidAt } : {}) },
    orderBy: [{ status: 'asc' }, { paidAt: 'desc' }, { dueAt: 'asc' }],
  });
}

interface ExpenseInput {
  description: string;
  category: ExpenseCategory;
  amountCents: number;
  status: ExpenseStatus;
  dueAt?: string | null;
  paidAt?: string | null;
  notes?: string | null;
}

// PENDING precisa de dueAt (é o que alimenta "vencimentos do dia"); PAID
// precisa de paidAt (é o que sempre alimentou receita/gasto do mês, DRE
// etc.) — validado aqui (não só no zod da rota) porque updateExpense também
// passa por aqui com input parcial, onde a combinação final só é conhecida
// depois de mesclar com o registro existente.
function assertStatusDatesConsistent(status: ExpenseStatus, dueAt: string | null | undefined, paidAt: string | null | undefined) {
  if (status === 'PENDING' && !dueAt) {
    throw new AppError('Informe a data de vencimento para um gasto pendente.', 422, 'DUE_DATE_REQUIRED');
  }
  if (status === 'PAID' && !paidAt) {
    throw new AppError('Informe a data de pagamento para um gasto já pago.', 422, 'PAID_DATE_REQUIRED');
  }
}

export async function createExpense(tenantId: string, input: ExpenseInput) {
  assertStatusDatesConsistent(input.status, input.dueAt, input.paidAt);

  return prisma.expense.create({
    data: {
      tenantId,
      description: input.description,
      category: input.category,
      amountCents: input.amountCents,
      status: input.status,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      paidAt: input.paidAt ? new Date(input.paidAt) : null,
      notes: input.notes ?? null,
    },
  });
}

export async function updateExpense(tenantId: string, id: string, input: Partial<ExpenseInput>) {
  const expense = await prisma.expense.findFirst({ where: { id, tenantId } });
  if (!expense) throw new NotFoundError('Gasto não encontrado.');

  const nextStatus = input.status ?? expense.status;
  const nextDueAt = input.dueAt !== undefined ? input.dueAt : expense.dueAt?.toISOString() ?? null;
  const nextPaidAt = input.paidAt !== undefined ? input.paidAt : expense.paidAt?.toISOString() ?? null;
  assertStatusDatesConsistent(nextStatus, nextDueAt, nextPaidAt);

  return prisma.expense.update({
    where: { id },
    data: {
      description: input.description ?? undefined,
      category: input.category ?? undefined,
      amountCents: input.amountCents ?? undefined,
      status: input.status ?? undefined,
      dueAt: input.dueAt !== undefined ? (input.dueAt ? new Date(input.dueAt) : null) : undefined,
      paidAt: input.paidAt !== undefined ? (input.paidAt ? new Date(input.paidAt) : null) : undefined,
      notes: input.notes === undefined ? undefined : input.notes,
    },
  });
}

// Baixa de um gasto pendente — ação dedicada (em vez de forçar o cliente a
// montar um PATCH com status+paidAt na mão) porque é o fluxo real do dia a
// dia: "isso aqui venceu hoje e acabei de pagar", não uma edição genérica.
export async function markExpensePaid(tenantId: string, id: string, paidAt: string) {
  const expense = await prisma.expense.findFirst({ where: { id, tenantId } });
  if (!expense) throw new NotFoundError('Gasto não encontrado.');

  return prisma.expense.update({
    where: { id },
    data: { status: 'PAID', paidAt: new Date(paidAt) },
  });
}

export async function deleteExpense(tenantId: string, id: string) {
  const expense = await prisma.expense.findFirst({ where: { id, tenantId } });
  if (!expense) throw new NotFoundError('Gasto não encontrado.');
  await prisma.expense.delete({ where: { id } });
}

async function getTenantTimezone(tenantId: string) {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  return tenant.timezone;
}

// "Vencimentos do dia" (gastos pendentes que vencem hoje) e "recebimentos do
// dia" (receita de atendimentos concluídos hoje) — dois lados do fluxo de
// caixa diário que o dashboard mensal não mostra: um resumo do mês não diz
// se HOJE tem conta vencendo ou quanto já entrou. Nada de projeção: só o que
// está de fato cadastrado com vencimento/atendimento em hoje.
export async function getTodaySummary(tenantId: string) {
  const timezone = await getTenantTimezone(tenantId);
  const todayStr = formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd');
  const todayDate = new Date(`${todayStr}T00:00:00Z`);
  const todayStart = fromZonedTime(`${todayStr}T00:00:00`, timezone);
  const todayEnd = fromZonedTime(`${todayStr}T23:59:59.999`, timezone);

  const [duesToday, completedToday] = await Promise.all([
    prisma.expense.findMany({
      where: { tenantId, status: 'PENDING', dueAt: todayDate },
      orderBy: { amountCents: 'desc' },
    }),
    prisma.appointment.findMany({
      where: { tenantId, status: 'COMPLETED', startAt: { gte: todayStart, lte: todayEnd } },
      select: {
        id: true,
        startAt: true,
        customer: { select: { name: true } },
        service: { select: { name: true, priceCents: true } },
      },
    }),
  ]);

  const vencimentosHojeCents = duesToday.reduce((sum, e) => sum + e.amountCents, 0);
  const recebimentosHojeCents = completedToday.reduce((sum, a) => sum + (a.service.priceCents ?? 0), 0);

  return {
    vencimentosHojeCents,
    vencimentosHoje: duesToday,
    recebimentosHojeCents,
    recebimentosHoje: completedToday.map((a) => ({
      id: a.id,
      startAt: a.startAt,
      customerName: a.customer.name,
      serviceName: a.service.name,
      amountCents: a.service.priceCents ?? 0,
    })),
  };
}

// Histórico de faturamento diário (Fase 3): série dia-a-dia de receita
// (atendimentos concluídos) nos últimos N dias, com a média simples — dá
// visão de tendência que o "receita do mês" sozinho não mostra (dois meses
// com o mesmo total podem ter perfis de dia a dia bem diferentes).
export async function getDailyRevenueHistory(tenantId: string, days: number) {
  const clampedDays = Math.min(180, Math.max(7, Math.round(days)));
  const timezone = await getTenantTimezone(tenantId);
  const now = new Date();

  const rangeStartStr = formatInTimeZone(new Date(now.getTime() - (clampedDays - 1) * 86400000), timezone, 'yyyy-MM-dd');
  const rangeStart = fromZonedTime(`${rangeStartStr}T00:00:00`, timezone);
  const todayStr = formatInTimeZone(now, timezone, 'yyyy-MM-dd');
  const rangeEnd = fromZonedTime(`${todayStr}T23:59:59.999`, timezone);

  const completed = await prisma.appointment.findMany({
    where: { tenantId, status: 'COMPLETED', startAt: { gte: rangeStart, lte: rangeEnd } },
    select: { startAt: true, service: { select: { priceCents: true } } },
  });

  const buckets = new Map<string, number>();
  for (let i = 0; i < clampedDays; i++) {
    const key = formatInTimeZone(new Date(now.getTime() - (clampedDays - 1 - i) * 86400000), timezone, 'yyyy-MM-dd');
    buckets.set(key, 0);
  }
  for (const appt of completed) {
    const key = formatInTimeZone(appt.startAt, timezone, 'yyyy-MM-dd');
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + (appt.service.priceCents ?? 0));
  }

  const daysSeries = Array.from(buckets.entries()).map(([date, totalCents]) => ({ date, totalCents }));
  const totalCents = daysSeries.reduce((sum, d) => sum + d.totalCents, 0);
  // Média sobre dias com faturamento > 0 (não sobre o range inteiro): uma
  // clínica fechada domingo/segunda não deveria ter sua média "diária" real
  // artificialmente puxada para baixo por dias que nunca teriam atendimento
  // — a pergunta que "média de faturamento diário" responde é "quanto entra
  // num dia de funcionamento normal", não "quanto entra por dia do
  // calendário incluindo dias fechados".
  const activeDays = daysSeries.filter((d) => d.totalCents > 0).length;
  const averageCents = activeDays > 0 ? Math.round(totalCents / activeDays) : 0;
  const averageAllDaysCents = Math.round(totalCents / clampedDays);

  return { days: daysSeries, totalCents, averageCents, averageAllDaysCents, activeDays };
}

const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  PRODUTOS: 'Produtos',
  EQUIPAMENTOS: 'Equipamentos',
  ALUGUEL: 'Aluguel',
  MARKETING: 'Marketing',
  SALARIOS: 'Salários',
  OUTROS: 'Outros',
};

interface DreInput {
  tenantId: string;
  from: string;
  to: string;
}

// DRE simplificado (Demonstração do Resultado do Exercício) — regime de
// caixa, não de competência: Receita Bruta soma atendimentos CONCLUÍDOS no
// período (mesma base já usada no dashboard/resumo mensal, nunca projeção),
// Despesas soma gastos já PAGOS no período agrupados por categoria (a
// mesma taxonomia do módulo de gastos, sem inventar um plano de contas
// contábil que este sistema não tem dado para sustentar). Resultado Líquido
// é a diferença. Não há linha de impostos/CMV separada porque o sistema não
// rastreia esses dados — um DRE contábil completo exigiria informação que
// simplesmente não existe aqui ainda.
export async function getDre({ tenantId, from, to }: DreInput) {
  const timezone = await getTenantTimezone(tenantId);
  const periodStart = fromZonedTime(`${from}T00:00:00`, timezone);
  const periodEnd = fromZonedTime(`${to}T23:59:59.999`, timezone);

  const [completed, expensesByCategoryRaw] = await Promise.all([
    prisma.appointment.findMany({
      where: { tenantId, status: 'COMPLETED', startAt: { gte: periodStart, lte: periodEnd } },
      select: { service: { select: { priceCents: true } } },
    }),
    prisma.expense.groupBy({
      by: ['category'],
      where: { tenantId, status: 'PAID', paidAt: { gte: periodStart, lte: periodEnd } },
      _sum: { amountCents: true },
    }),
  ]);

  const revenueCents = completed.reduce((sum, a) => sum + (a.service.priceCents ?? 0), 0);
  const expensesByCategory = expensesByCategoryRaw
    .map((g) => ({
      category: g.category,
      label: EXPENSE_CATEGORY_LABELS[g.category],
      totalCents: g._sum.amountCents ?? 0,
    }))
    .sort((a, b) => b.totalCents - a.totalCents);
  const totalExpensesCents = expensesByCategory.reduce((sum, g) => sum + g.totalCents, 0);

  return {
    periodFrom: from,
    periodTo: to,
    revenueCents,
    expensesByCategory,
    totalExpensesCents,
    netResultCents: revenueCents - totalExpensesCents,
    marginPct: revenueCents > 0 ? Math.round(((revenueCents - totalExpensesCents) / revenueCents) * 100) : null,
  };
}

// --- Conciliação bancária (OFX) ---

export async function importBankStatement(tenantId: string, ofxContent: string) {
  const parsed = parseOfx(ofxContent);
  if (parsed.length === 0) {
    throw new AppError('Nenhuma transação encontrada no arquivo — verifique se é um OFX válido.', 422, 'EMPTY_OFX');
  }

  let imported = 0;
  let skipped = 0;
  for (const txn of parsed) {
    const existing = await prisma.bankTransaction.findUnique({
      where: { tenantId_fitId: { tenantId, fitId: txn.fitId } },
    });
    if (existing) {
      skipped += 1;
      continue;
    }
    await prisma.bankTransaction.create({
      data: {
        tenantId,
        fitId: txn.fitId,
        postedAt: txn.postedAt,
        amountCents: txn.amountCents,
        description: txn.description,
        memo: txn.memo,
      },
    });
    imported += 1;
  }

  return { imported, skipped, total: parsed.length };
}

interface ListBankTransactionsInput {
  tenantId: string;
  status?: BankTransactionStatus;
}

export async function listBankTransactions({ tenantId, status }: ListBankTransactionsInput) {
  return prisma.bankTransaction.findMany({
    where: { tenantId, ...(status ? { status } : {}) },
    include: { matchedExpense: true },
    orderBy: { postedAt: 'desc' },
  });
}

// Sugestão de conciliação: candidatos a gasto para uma transação de SAÍDA
// (amountCents negativo) do extrato — mesmo valor absoluto (conciliação
// bancária real quase nunca casa por valor aproximado, é exato ou não é o
// mesmo lançamento) e data de pagamento/vencimento dentro de uma janela de
// alguns dias (compensa a diferença entre "quando o gasto foi lançado no
// sistema" e "quando o banco de fato processou o débito"). Só considera
// gastos ainda não conciliados com NENHUMA outra transação.
const MATCH_WINDOW_DAYS = 5;

export async function suggestMatches(tenantId: string, bankTransactionId: string) {
  const txn = await prisma.bankTransaction.findFirst({ where: { id: bankTransactionId, tenantId } });
  if (!txn) throw new NotFoundError('Transação bancária não encontrada.');
  if (txn.amountCents >= 0) return [];

  const targetAmount = Math.abs(txn.amountCents);
  const windowStart = new Date(txn.postedAt.getTime() - MATCH_WINDOW_DAYS * 86400000);
  const windowEnd = new Date(txn.postedAt.getTime() + MATCH_WINDOW_DAYS * 86400000);

  const candidates = await prisma.expense.findMany({
    where: {
      tenantId,
      amountCents: targetAmount,
      bankTransactions: { none: { status: 'MATCHED' } },
      OR: [
        { paidAt: { gte: windowStart, lte: windowEnd } },
        { dueAt: { gte: windowStart, lte: windowEnd } },
      ],
    },
    take: 5,
  });

  return candidates;
}

export async function matchBankTransaction(tenantId: string, bankTransactionId: string, expenseId: string) {
  const [txn, expense] = await Promise.all([
    prisma.bankTransaction.findFirst({ where: { id: bankTransactionId, tenantId } }),
    prisma.expense.findFirst({ where: { id: expenseId, tenantId } }),
  ]);
  if (!txn) throw new NotFoundError('Transação bancária não encontrada.');
  if (!expense) throw new NotFoundError('Gasto não encontrado.');

  // Conciliar uma transação bancária de saída com um gasto ainda PENDING é o
  // próprio ato de "isso foi pago" — a conciliação já dá baixa automática,
  // usando a data que o banco processou (postedAt) como data de pagamento,
  // em vez de exigir uma segunda ação manual "marcar como pago" logo depois.
  const [updatedTxn] = await prisma.$transaction([
    prisma.bankTransaction.update({
      where: { id: bankTransactionId },
      data: { status: 'MATCHED', matchedExpenseId: expenseId },
    }),
    ...(expense.status === 'PENDING'
      ? [prisma.expense.update({ where: { id: expenseId }, data: { status: 'PAID', paidAt: txn.postedAt } })]
      : []),
  ]);

  return updatedTxn;
}

export async function unmatchBankTransaction(tenantId: string, bankTransactionId: string) {
  const txn = await prisma.bankTransaction.findFirst({ where: { id: bankTransactionId, tenantId } });
  if (!txn) throw new NotFoundError('Transação bancária não encontrada.');

  return prisma.bankTransaction.update({
    where: { id: bankTransactionId },
    data: { status: 'UNMATCHED', matchedExpenseId: null },
  });
}

export async function ignoreBankTransaction(tenantId: string, bankTransactionId: string) {
  const txn = await prisma.bankTransaction.findFirst({ where: { id: bankTransactionId, tenantId } });
  if (!txn) throw new NotFoundError('Transação bancária não encontrada.');

  return prisma.bankTransaction.update({
    where: { id: bankTransactionId },
    data: { status: 'IGNORED', matchedExpenseId: null },
  });
}
