import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { prisma } from '../../lib/prisma';

// Todo número aqui vem de dado real cadastrado — nenhuma projeção/estimativa
// inventada. "Receita do mês" soma só atendimentos já marcados como
// concluídos (ver appointments admin) com preço cadastrado; serviços "sob
// consulta" (priceCents null) entram como 0 em vez de quebrar a soma.
//
// chartDays controla só a janela do gráfico "Agendamentos por dia" (o resto
// do painel — receita, gastos, KPIs — continua sempre no mês corrente,
// independente disso): o painel administrativo deixa a pessoa escolher entre
// 7/14/30/60/90 dias em vez de um período fixo de 14 dias.
export async function getDashboardStats(tenantId: string, chartDays = 14) {
  const days = Math.min(90, Math.max(1, Math.round(chartDays)));
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const timezone = tenant.timezone;
  const now = new Date();

  const todayStr = formatInTimeZone(now, timezone, 'yyyy-MM-dd');
  const todayStart = fromZonedTime(`${todayStr}T00:00:00`, timezone);
  const todayEnd = fromZonedTime(`${todayStr}T23:59:59.999`, timezone);

  const [yearStr, monthStr] = formatInTimeZone(now, timezone, 'yyyy-MM').split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const monthStart = fromZonedTime(`${yearStr}-${monthStr}-01T00:00:00`, timezone);
  const nextMonth = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthEnd = new Date(fromZonedTime(`${nextMonth}-01T00:00:00`, timezone).getTime() - 1);

  const chartRangeStart = fromZonedTime(
    `${formatInTimeZone(new Date(now.getTime() - (days - 1) * 86400000), timezone, 'yyyy-MM-dd')}T00:00:00`,
    timezone,
  );

  // Mês anterior — só para calcular a variação percentual de receita/gastos
  // exibida no painel (ex.: "+12% vs. mês passado"); nenhum dado novo, é o
  // mesmo cálculo de receita/gastos de sempre aplicado a um range deslocado.
  const prevMonthDate = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const prevMonthStr = `${prevMonthDate.y}-${String(prevMonthDate.m).padStart(2, '0')}`;
  const prevMonthStart = fromZonedTime(`${prevMonthStr}-01T00:00:00`, timezone);
  const prevMonthEnd = new Date(monthStart.getTime() - 1);

  const [
    appointmentsToday,
    appointmentsThisMonth,
    statusGroups,
    expensesAgg,
    expensesByCategoryRaw,
    inventoryItems,
    completedThisMonth,
    recentAppointments,
    prevCompleted,
    prevExpensesAgg,
    upcomingAppointmentsRaw,
    serviceCountAppointments,
  ] = await Promise.all([
    prisma.appointment.count({
      where: { tenantId, status: 'CONFIRMED', startAt: { gte: todayStart, lte: todayEnd } },
    }),
    prisma.appointment.count({ where: { tenantId, startAt: { gte: monthStart, lte: monthEnd } } }),
    prisma.appointment.groupBy({
      by: ['status'],
      where: { tenantId, startAt: { gte: monthStart, lte: monthEnd } },
      _count: { _all: true },
    }),
    prisma.expense.aggregate({
      where: { tenantId, paidAt: { gte: monthStart, lte: monthEnd } },
      _sum: { amountCents: true },
    }),
    prisma.expense.groupBy({
      by: ['category'],
      where: { tenantId, paidAt: { gte: monthStart, lte: monthEnd } },
      _sum: { amountCents: true },
    }),
    prisma.inventoryItem.findMany({ where: { tenantId, active: true } }),
    prisma.appointment.findMany({
      where: { tenantId, status: 'COMPLETED', startAt: { gte: monthStart, lte: monthEnd } },
      select: { service: { select: { priceCents: true } } },
    }),
    prisma.appointment.findMany({
      where: { tenantId, startAt: { gte: chartRangeStart, lte: todayEnd } },
      select: { startAt: true },
    }),
    prisma.appointment.findMany({
      where: { tenantId, status: 'COMPLETED', startAt: { gte: prevMonthStart, lte: prevMonthEnd } },
      select: { service: { select: { priceCents: true } } },
    }),
    prisma.expense.aggregate({
      where: { tenantId, paidAt: { gte: prevMonthStart, lte: prevMonthEnd } },
      _sum: { amountCents: true },
    }),
    prisma.appointment.findMany({
      where: { tenantId, status: 'CONFIRMED', startAt: { gte: now } },
      orderBy: { startAt: 'asc' },
      take: 5,
      select: { id: true, startAt: true, customer: { select: { name: true } }, service: { select: { name: true } } },
    }),
    prisma.appointment.findMany({
      where: { tenantId, startAt: { gte: monthStart, lte: monthEnd }, status: { not: 'CANCELLED' } },
      select: { service: { select: { id: true, name: true } } },
    }),
  ]);

  const revenueThisMonthCents = completedThisMonth.reduce((sum, appt) => sum + (appt.service.priceCents ?? 0), 0);
  const expensesThisMonthCents = expensesAgg._sum.amountCents ?? 0;
  const prevRevenueCents = prevCompleted.reduce((sum, appt) => sum + (appt.service.priceCents ?? 0), 0);
  const prevExpensesCents = prevExpensesAgg._sum.amountCents ?? 0;

  // Variação percentual vs. mês anterior — null quando o mês anterior não
  // tem base de comparação (0), para o front distinguir "sem dado" de "caiu
  // 100%" em vez de mostrar um número enganoso.
  const revenueChangePct = prevRevenueCents > 0 ? Math.round(((revenueThisMonthCents - prevRevenueCents) / prevRevenueCents) * 100) : null;
  const expensesChangePct = prevExpensesCents > 0 ? Math.round(((expensesThisMonthCents - prevExpensesCents) / prevExpensesCents) * 100) : null;

  const completedCount = statusGroups.find((g) => g.status === 'COMPLETED')?._count._all ?? 0;
  const cancelledCount = statusGroups.find((g) => g.status === 'CANCELLED')?._count._all ?? 0;
  const noShowCount = statusGroups.find((g) => g.status === 'NO_SHOW')?._count._all ?? 0;
  const finishedCount = completedCount + cancelledCount + noShowCount;

  const avgTicketCents = completedCount > 0 ? Math.round(revenueThisMonthCents / completedCount) : 0;
  const completionRatePct = finishedCount > 0 ? Math.round((completedCount / finishedCount) * 100) : null;
  const noShowRatePct = finishedCount > 0 ? Math.round((noShowCount / finishedCount) * 100) : null;

  const serviceCounts = new Map<string, { name: string; count: number }>();
  for (const appt of serviceCountAppointments) {
    const entry = serviceCounts.get(appt.service.id) ?? { name: appt.service.name, count: 0 };
    entry.count += 1;
    serviceCounts.set(appt.service.id, entry);
  }
  const topServices = Array.from(serviceCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const upcomingAppointments = upcomingAppointmentsRaw.map((appt) => ({
    id: appt.id,
    startAt: appt.startAt,
    customerName: appt.customer.name,
    serviceName: appt.service.name,
  }));

  const dayBuckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() - (days - 1 - i) * 86400000);
    dayBuckets.set(formatInTimeZone(d, timezone, 'yyyy-MM-dd'), 0);
  }
  for (const appt of recentAppointments) {
    const key = formatInTimeZone(appt.startAt, timezone, 'yyyy-MM-dd');
    if (dayBuckets.has(key)) dayBuckets.set(key, (dayBuckets.get(key) ?? 0) + 1);
  }

  const lowStockItems = inventoryItems
    .filter((item) => item.quantity <= item.minQuantity)
    .sort((a, b) => a.quantity - b.quantity)
    .map((item) => ({ id: item.id, name: item.name, quantity: item.quantity, minQuantity: item.minQuantity, unit: item.unit }));

  return {
    appointmentsToday,
    appointmentsThisMonth,
    appointmentStatusBreakdown: statusGroups.map((g) => ({ status: g.status, count: g._count._all })),
    appointmentsPerDay: Array.from(dayBuckets.entries()).map(([date, count]) => ({ date, count })),
    revenueThisMonthCents,
    expensesThisMonthCents,
    balanceThisMonthCents: revenueThisMonthCents - expensesThisMonthCents,
    revenueChangePct,
    expensesChangePct,
    avgTicketCents,
    completionRatePct,
    noShowRatePct,
    expensesByCategory: expensesByCategoryRaw.map((g) => ({ category: g.category, totalCents: g._sum.amountCents ?? 0 })),
    lowStockItems,
    lowStockCount: lowStockItems.length,
    upcomingAppointments,
    topServices,
  };
}
