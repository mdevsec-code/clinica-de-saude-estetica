import { addDays } from 'date-fns';
import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../utils/errors';

export type ReminderKind = 'RETURN' | 'BIRTHDAY';

export interface UnifiedReminder {
  kind: ReminderKind;
  date: Date;
  daysUntil: number;
  customerId: string;
  customerName: string;
  customerWhatsapp: string;
  // Só presente em RETURN.
  returnReminderId?: string;
  serviceName?: string;
  offsetDays?: number;
}

// Próximo aniversário a partir de "hoje": se o dia/mês já passou este ano,
// vira o do ano que vem. Comparado em UTC "puro" (ano fixo em 2000) porque
// birthDate é @db.Date — sem fuso horário nenhum envolvido, só dia e mês.
function nextBirthday(birthDate: Date, from: Date): Date {
  const month = birthDate.getUTCMonth();
  const day = birthDate.getUTCDate();
  let next = new Date(Date.UTC(from.getUTCFullYear(), month, day));
  const fromMidnight = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  if (next < fromMidnight) {
    next = new Date(Date.UTC(from.getUTCFullYear() + 1, month, day));
  }
  return next;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

// Une retornos de procedimento (PENDING, dentro da janela) e aniversários
// (próximos N dias, calculado em memória — ver nextBirthday) num único feed
// ordenado por data, consumido pelo dashboard e pela agenda (mesmo pedido
// de "lembretes automáticos... com exibição no dashboard e na agenda", uma
// fonte só em vez de duas telas reimplementando a mesma lógica).
export async function getUpcomingReminders(tenantId: string, windowDays = 30): Promise<UnifiedReminder[]> {
  const now = new Date();
  const todayMidnightUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const windowEnd = addDays(todayMidnightUtc, windowDays);

  const [returnReminders, customersWithBirthday] = await Promise.all([
    prisma.returnReminder.findMany({
      where: { tenantId, status: 'PENDING', dueAt: { lte: windowEnd } },
      orderBy: { dueAt: 'asc' },
      include: {
        customer: { select: { id: true, name: true, whatsapp: true } },
        procedureRecord: { include: { service: { select: { name: true } } } },
      },
    }),
    prisma.customer.findMany({
      where: { tenantId, birthDate: { not: null } },
      select: { id: true, name: true, whatsapp: true, birthDate: true },
    }),
  ]);

  const results: UnifiedReminder[] = returnReminders.map((r) => ({
    kind: 'RETURN',
    date: r.dueAt,
    daysUntil: daysBetween(r.dueAt, todayMidnightUtc),
    customerId: r.customerId,
    customerName: r.customer.name,
    customerWhatsapp: r.customer.whatsapp,
    returnReminderId: r.id,
    serviceName: r.procedureRecord.service.name,
    offsetDays: r.offsetDays,
  }));

  for (const c of customersWithBirthday) {
    if (!c.birthDate) continue;
    const next = nextBirthday(c.birthDate, todayMidnightUtc);
    const daysUntil = daysBetween(next, todayMidnightUtc);
    if (daysUntil <= windowDays) {
      results.push({
        kind: 'BIRTHDAY',
        date: next,
        daysUntil,
        customerId: c.id,
        customerName: c.name,
        customerWhatsapp: c.whatsapp,
      });
    }
  }

  return results.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export async function markReturnReminderStatus(tenantId: string, reminderId: string, status: 'DONE' | 'DISMISSED') {
  const reminder = await prisma.returnReminder.findFirst({ where: { id: reminderId, tenantId } });
  if (!reminder) throw new NotFoundError('Lembrete não encontrado.');

  return prisma.returnReminder.update({ where: { id: reminder.id }, data: { status } });
}
