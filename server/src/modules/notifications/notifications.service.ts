import { formatInTimeZone } from 'date-fns-tz';
import { prisma } from '../../lib/prisma';

// Sino do painel: o que as clientes (e a equipe) mudaram na agenda — o
// painel busca de tempos em tempos (GET /notifications) e toca o sino.
// Guardado no banco para todas as telas abertas (Noely e recepção) verem o
// mesmo; só os últimos 30 dias ficam.

export type NotificationKind = 'BOOKED' | 'CANCELLED' | 'CONFIRMED' | 'RESCHEDULED';

const KEEP_DAYS = 30;

export async function notify(
  tenantId: string,
  kind: NotificationKind,
  title: string,
  body: string,
  actorUserId?: string | null,
) {
  try {
    await prisma.notification.create({ data: { tenantId, kind, title, body, actorUserId: actorUserId ?? null } });
    await prisma.notification.deleteMany({ where: { tenantId, createdAt: { lt: new Date(Date.now() - KEEP_DAYS * 86_400_000) } } });
  } catch (err) {
    // Aviso que falha não pode derrubar o agendamento que o gerou.
    console.error('Falha ao registrar notificação:', err);
  }
}

// "Fulana · Botox · sex. 14/11 às 10:30"
export async function describeAppointment(tenantId: string, appointmentIds: string[]) {
  const [tenant, appts] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } }),
    prisma.appointment.findMany({
      where: { id: { in: appointmentIds }, tenantId },
      include: { customer: { select: { name: true } }, service: { select: { name: true } } },
      orderBy: { startAt: 'asc' },
    }),
  ]);
  if (!appts.length) return null;
  const tz = tenant?.timezone ?? 'America/Bahia';
  const when = formatInTimeZone(appts[0].startAt, tz, "dd/MM 'às' HH:mm");
  return {
    customer: appts[0].customer.name,
    text: `${appts[0].customer.name} · ${appts.map((a) => a.service.name).join(' + ')} · ${when}`,
  };
}

export function listNotifications(tenantId: string) {
  return prisma.notification.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, kind: true, title: true, body: true, actorUserId: true, createdAt: true },
  });
}
