import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/errors';

// ── Horário de funcionamento (editável pelo painel) ─────────────────────────
// Um intervalo por dia (abre/fecha) e a pausa de almoço, que vale para todos
// os dias. Os horários do site e a agenda do painel saem daqui.

export interface ScheduleDay {
  weekday: number; // 0 = domingo … 6 = sábado
  open: boolean;
  opensAt: string; // "09:00"
  closesAt: string;
}

export interface ScheduleInput {
  days: ScheduleDay[];
  lunch: { enabled: boolean; start: string; end: string };
}

const DEFAULT_RANGE = { opensAt: '09:00', closesAt: '17:00' };

export async function getSchedule(tenantId: string) {
  const [hours, settings] = await Promise.all([
    prisma.businessHour.findMany({ where: { tenantId, active: true }, orderBy: [{ weekday: 'asc' }, { opensAt: 'asc' }] }),
    prisma.tenantSettings.findUnique({ where: { tenantId }, select: { lunchStart: true, lunchEnd: true } }),
  ]);
  const days: ScheduleDay[] = Array.from({ length: 7 }, (_, weekday) => {
    const ranges = hours.filter((h) => h.weekday === weekday);
    // Dia com mais de uma faixa (manhã e tarde) aparece de abertura a
    // fechamento; ao salvar, vira uma faixa só — a pausa do meio-dia agora
    // é o almoço.
    return ranges.length
      ? { weekday, open: true, opensAt: ranges[0].opensAt, closesAt: ranges[ranges.length - 1].closesAt }
      : { weekday, open: false, ...DEFAULT_RANGE };
  });
  return {
    days,
    lunch: {
      enabled: Boolean(settings?.lunchStart && settings?.lunchEnd),
      start: settings?.lunchStart ?? '12:00',
      end: settings?.lunchEnd ?? '13:00',
    },
  };
}

export async function saveSchedule(tenantId: string, input: ScheduleInput) {
  for (const d of input.days) {
    if (d.open && d.opensAt >= d.closesAt) {
      throw new AppError('Em algum dia, o horário de fechar está antes do de abrir.', 422, 'INVALID_SCHEDULE');
    }
  }
  if (input.lunch.enabled && input.lunch.start >= input.lunch.end) {
    throw new AppError('O fim do almoço precisa ser depois do início.', 422, 'INVALID_SCHEDULE');
  }
  await prisma.$transaction([
    prisma.businessHour.deleteMany({ where: { tenantId } }),
    prisma.businessHour.createMany({
      data: input.days.filter((d) => d.open).map((d) => ({ tenantId, weekday: d.weekday, opensAt: d.opensAt, closesAt: d.closesAt, active: true })),
    }),
    prisma.tenantSettings.update({
      where: { tenantId },
      data: input.lunch.enabled ? { lunchStart: input.lunch.start, lunchEnd: input.lunch.end } : { lunchStart: null, lunchEnd: null },
    }),
  ]);
  return getSchedule(tenantId);
}

export async function getPublicSettings(tenantId: string) {
  const [settings, businessHours] = await Promise.all([
    prisma.tenantSettings.findUnique({ where: { tenantId } }),
    prisma.businessHour.findMany({
      where: { tenantId, active: true },
      orderBy: { weekday: 'asc' },
    }),
  ]);

  return {
    whatsapp: settings?.whatsapp ?? null,
    instagram: settings?.instagram ?? null,
    email: settings?.email ?? null,
    address: settings?.address ?? null,
    addressMapUrl: settings?.addressMapUrl ?? null,
    businessHours: businessHours.map((bh) => ({
      weekday: bh.weekday,
      opensAt: bh.opensAt,
      closesAt: bh.closesAt,
    })),
  };
}
