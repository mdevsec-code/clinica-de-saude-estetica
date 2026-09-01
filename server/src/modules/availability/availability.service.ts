import { addMinutes, isBefore } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import { prisma } from '../../lib/prisma';
import { AppError, NotFoundError } from '../../utils/errors';

interface Slot {
  startAt: string; // ISO 8601, UTC
  endAt: string;
}

// Toda a disponibilidade é calculada aqui, no backend, a partir de dados reais:
// horário de funcionamento + agendamentos existentes + bloqueios manuais.
// O frontend nunca decide o que está livre — apenas exibe o que este serviço retorna
// (item 25 do escopo: "nunca calcular disponibilidade apenas no frontend").
export async function computeAvailableSlots(tenantId: string, serviceId: string, dateStr: string) {
  const [tenant, service, settings] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    prisma.service.findFirst({ where: { id: serviceId, tenantId, active: true } }),
    prisma.tenantSettings.findUnique({ where: { tenantId } }),
  ]);

  if (!service) {
    throw new NotFoundError('Serviço não encontrado.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new AppError('Data inválida.', 422, 'INVALID_DATE');
  }

  const timezone = tenant.timezone;
  const slotGranularityMin = settings?.slotGranularityMin ?? 15;
  const minAdvanceMinutes = settings?.minAdvanceMinutes ?? 120;
  const maxAdvanceDays = settings?.maxAdvanceDays ?? 60;

  const dayStartUtc = fromZonedTime(`${dateStr}T00:00:00`, timezone);
  const dayEndUtc = fromZonedTime(`${dateStr}T23:59:59.999`, timezone);

  const today = new Date();
  const maxDate = addMinutes(today, maxAdvanceDays * 24 * 60);
  if (isBefore(maxDate, dayStartUtc)) {
    return { slots: [] as Slot[] };
  }

  // getDay() na timezone do tenant: como fromZonedTime já trata o "meio-dia local"
  // como referência estável, usamos a data-string diretamente para achar o weekday
  // sem depender do fuso do processo Node.
  const weekday = new Date(`${dateStr}T12:00:00Z`).getUTCDay();

  const businessHours = await prisma.businessHour.findMany({
    where: { tenantId, weekday, active: true },
  });

  if (businessHours.length === 0) {
    return { slots: [] as Slot[] };
  }

  const [existingAppointments, blockedTimes] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        tenantId,
        status: 'CONFIRMED',
        startAt: { lt: dayEndUtc },
        endAt: { gt: dayStartUtc },
      },
      select: { startAt: true, endAt: true },
    }),
    prisma.blockedTime.findMany({
      where: {
        tenantId,
        startAt: { lt: dayEndUtc },
        endAt: { gt: dayStartUtc },
      },
      select: { startAt: true, endAt: true },
    }),
  ]);

  const busyPeriods = [...existingAppointments, ...blockedTimes];
  const earliestAllowedStart = addMinutes(today, minAdvanceMinutes);
  const durationMs = (service.durationMinutes + service.bufferMinutes) * 60 * 1000;
  const stepMs = slotGranularityMin * 60 * 1000;

  const slots: Slot[] = [];

  for (const window of businessHours) {
    const windowStart = fromZonedTime(`${dateStr}T${window.opensAt}:00`, timezone);
    const windowEnd = fromZonedTime(`${dateStr}T${window.closesAt}:00`, timezone);

    for (let start = windowStart.getTime(); start + durationMs <= windowEnd.getTime(); start += stepMs) {
      const candidateStart = new Date(start);
      const candidateEnd = new Date(start + durationMs);

      if (isBefore(candidateStart, earliestAllowedStart)) {
        continue;
      }

      const overlapsBusyPeriod = busyPeriods.some(
        (busy) => candidateStart < busy.endAt && candidateEnd > busy.startAt,
      );
      if (overlapsBusyPeriod) {
        continue;
      }

      slots.push({ startAt: candidateStart.toISOString(), endAt: candidateEnd.toISOString() });
    }
  }

  return { slots };
}
