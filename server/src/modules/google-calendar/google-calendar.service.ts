import { addDays } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import { prisma } from '../../lib/prisma';
import {
  deleteGoogleEvent,
  insertGoogleEvent,
  isGoogleCalendarConfigured,
  listGoogleEvents,
  updateGoogleEvent,
  type GoogleEvent,
  type GoogleEventInput,
} from '../../lib/google-calendar-client';

// Integração com o Google Agenda da clínica, nos dois sentidos:
//   - Saída: todo agendamento CONFIRMED vira um evento na agenda da Noely,
//     apagado se o agendamento for cancelado (syncAppointmentToGoogle).
//   - Entrada: compromissos que a Noely marca direto no Google (médico,
//     viagem, folga) viram BlockedTime de source GOOGLE_CALENDAR e somem da
//     grade de horários do site (importGoogleBusyTimes).
// Os eventos criados pela saída carregam noelyAppointmentId nas
// extendedProperties privadas — é isso que a entrada usa para não importar
// de volta os próprios agendamentos como bloqueio.
//
// Mesmo princípio do WhatsApp (ver notifications.service.ts): é efeito
// colateral, nunca pode derrubar a ação principal. Quem chama sempre usa
// .catch(); e o que falhar na hora (Google fora do ar) é reenviado pela
// sincronização periódica (runGoogleCalendarSync), que procura confirmados
// sem evento e cancelados com evento sobrando.

const SOURCE = 'GOOGLE_CALENDAR';
const APPOINTMENT_ID_KEY = 'noelyAppointmentId';

// Detalhe mínimo de propósito (LGPD): o evento vai para uma conta Google,
// fora do banco da clínica — só o primeiro nome e o serviço, o bastante pra
// Noely bater o olho na agenda do celular. Telefone, observações e qualquer
// dado de saúde ficam só no painel.
async function buildEvent(appointmentId: string): Promise<GoogleEventInput | null> {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      customer: { select: { name: true } },
      service: { select: { name: true } },
      tenant: { select: { timezone: true, settings: { select: { address: true } } } },
    },
  });
  if (!appt) return null;

  const firstName = appt.customer.name.trim().split(/\s+/)[0];
  return {
    summary: `${firstName} — ${appt.service.name}`,
    description: 'Agendamento da clínica. Dados da paciente no painel administrativo.',
    location: appt.tenant.settings?.address ?? undefined,
    start: { dateTime: appt.startAt.toISOString(), timeZone: appt.tenant.timezone },
    end: { dateTime: appt.endAt.toISOString(), timeZone: appt.tenant.timezone },
    extendedProperties: { private: { [APPOINTMENT_ID_KEY]: appt.id } },
  };
}

// Idempotente: pode ser chamada quantas vezes for, em qualquer status, e
// deixa o Google refletindo o agendamento — CONFIRMED tem evento,
// CANCELLED não tem. COMPLETED/NO_SHOW mantêm o evento que já existir (o
// atendimento aconteceu ou estava marcado ali, faz sentido continuar no
// histórico da agenda) sem criar um novo para o passado.
export async function syncAppointmentToGoogle(appointmentId: string): Promise<void> {
  if (!isGoogleCalendarConfigured()) return;

  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, status: true, googleEventId: true },
  });
  if (!appt) return;

  if (appt.status === 'CANCELLED') {
    if (appt.googleEventId) {
      await deleteGoogleEvent(appt.googleEventId);
      await prisma.appointment.update({ where: { id: appt.id }, data: { googleEventId: null } });
    }
    return;
  }

  if (appt.status !== 'CONFIRMED') return;

  const event = await buildEvent(appt.id);
  if (!event) return;

  if (appt.googleEventId && (await updateGoogleEvent(appt.googleEventId, event))) return;

  const eventId = await insertGoogleEvent(event);
  await prisma.appointment.update({ where: { id: appt.id }, data: { googleEventId: eventId } });
}

// Só o que de fato ocupa a Noely vira bloqueio: evento marcado como "Livre"
// no Google (transparent), convite recusado, marcador de local de trabalho
// e aniversário de contato não tiram horário do site.
function isBusyEvent(event: GoogleEvent): boolean {
  if (event.status === 'cancelled') return false;
  if (event.transparency === 'transparent') return false;
  if (event.eventType === 'workingLocation' || event.eventType === 'birthday') return false;
  if (event.extendedProperties?.private?.[APPOINTMENT_ID_KEY]) return false;
  const self = event.attendees?.find((a) => a.self);
  if (self?.responseStatus === 'declined') return false;
  return true;
}

function eventBoundary(time: GoogleEvent['start'], timezone: string): Date | null {
  if (time.dateTime) return new Date(time.dateTime);
  // Dia inteiro ("Férias", "Feriado"): bloqueia da meia-noite local do
  // primeiro dia até a meia-noite local do dia final (exclusivo, como o
  // próprio Google manda).
  if (time.date) return fromZonedTime(`${time.date}T00:00:00`, timezone);
  return null;
}

// Espelha os compromissos do Google na janela que o site deixa agendar
// (hoje até maxAdvanceDays). Substitui por completo os bloqueios
// GOOGLE_CALENDAR dessa janela a cada rodada em vez de sincronizar
// incrementalmente: o volume de uma agenda pessoal é pequeno, e assim
// evento apagado ou movido no Google é refletido sem lógica extra.
export async function importGoogleBusyTimes(tenantId: string): Promise<number> {
  const [tenant, settings] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    prisma.tenantSettings.findUnique({ where: { tenantId } }),
  ]);
  const windowStart = addDays(new Date(), -1);
  const windowEnd = addDays(new Date(), (settings?.maxAdvanceDays ?? 420) + 1);

  const events = await listGoogleEvents(windowStart, windowEnd);
  const blocks = events.filter(isBusyEvent).flatMap((event) => {
    const startAt = eventBoundary(event.start, tenant.timezone);
    const endAt = eventBoundary(event.end, tenant.timezone);
    if (!startAt || !endAt || endAt <= startAt) return [];
    return [
      {
        tenantId,
        startAt,
        endAt,
        source: SOURCE,
        externalId: event.id,
        reason: event.summary?.slice(0, 200) || 'Compromisso no Google Agenda',
      },
    ];
  });

  await prisma.$transaction([
    prisma.blockedTime.deleteMany({
      where: { tenantId, source: SOURCE, startAt: { lt: windowEnd }, endAt: { gt: windowStart } },
    }),
    prisma.blockedTime.createMany({ data: blocks }),
  ]);

  return blocks.length;
}

// Reenvia o que ficou para trás (Google fora do ar na hora de agendar ou
// cancelar, integração ligada depois de já existirem agendamentos). Só
// agendamentos futuros: o passado não precisa ir pra agenda.
async function reconcileAppointments(tenantId: string): Promise<void> {
  const pending = await prisma.appointment.findMany({
    where: {
      tenantId,
      OR: [
        { status: 'CONFIRMED', googleEventId: null, startAt: { gte: new Date() } },
        { status: 'CANCELLED', googleEventId: { not: null } },
      ],
    },
    select: { id: true },
    take: 50,
  });
  for (const { id } of pending) {
    await syncAppointmentToGoogle(id).catch((err) =>
      console.error(`Falha ao sincronizar agendamento ${id} com o Google Agenda:`, err),
    );
  }
}

interface SyncStatus {
  configured: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  importedBlocks: number;
}

// Em memória de propósito: um único processo da API (VPS), e a primeira
// rodada acontece logo ao subir — perder isso num restart não perde dado,
// só o "última sincronização" volta a vazio por alguns segundos.
const status: SyncStatus = { configured: false, lastSyncAt: null, lastError: null, importedBlocks: 0 };
let running = false;

export function getGoogleCalendarSyncStatus(): SyncStatus {
  return { ...status, configured: isGoogleCalendarConfigured() };
}

export async function runGoogleCalendarSync(): Promise<SyncStatus> {
  if (!isGoogleCalendarConfigured() || running) return getGoogleCalendarSyncStatus();
  running = true;
  try {
    const tenants = await prisma.tenant.findMany({ select: { id: true } });
    let imported = 0;
    for (const tenant of tenants) {
      await reconcileAppointments(tenant.id);
      imported += await importGoogleBusyTimes(tenant.id);
    }
    status.importedBlocks = imported;
    status.lastError = null;
  } catch (err) {
    status.lastError = err instanceof Error ? err.message : String(err);
    console.error('Falha na sincronização com o Google Agenda:', err);
  } finally {
    status.lastSyncAt = new Date().toISOString();
    running = false;
  }
  return getGoogleCalendarSyncStatus();
}

export function startGoogleCalendarSyncLoop(intervalMinutes: number): void {
  if (!isGoogleCalendarConfigured()) return;
  void runGoogleCalendarSync();
  setInterval(() => void runGoogleCalendarSync(), intervalMinutes * 60 * 1000).unref();
}
