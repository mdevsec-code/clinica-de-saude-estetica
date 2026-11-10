import { Prisma, type AppointmentStatus } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import { prisma } from '../../lib/prisma';
import { AppError, ConflictError, NotFoundError } from '../../utils/errors';
import { findOrCreateCustomer } from '../customers/customers.service';
import { onAppointmentCreated } from '../whatsapp/whatsapp-automation';
import { computeAvailableSlots } from '../availability/availability.service';
import { createProcedureRecordForAppointment } from '../patients/procedures.service';
import { sendCancellationWhatsapp } from '../patients/notifications.service';
import { syncAppointmentToGoogle } from '../google-calendar/google-calendar.service';

interface CreateVisitInput {
  tenantId: string;
  serviceIds: string[];
  startAt: string; // ISO 8601
  customer: { name: string; whatsapp: string; email?: string };
  notes?: string;
}

async function loadServices(tenantId: string, serviceIds: string[]) {
  const found = await prisma.service.findMany({ where: { id: { in: serviceIds }, tenantId, active: true } });
  const services = serviceIds.map((id) => found.find((s) => s.id === id));
  if (!services.length || services.some((s) => !s)) {
    throw new NotFoundError('Serviço não encontrado.');
  }
  return services as NonNullable<(typeof services)[number]>[];
}

function parseStart(iso: string) {
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) {
    throw new AppError('Horário inválido.', 422, 'INVALID_DATE');
  }
  return start;
}

// Uma visita com vários serviços vira um atendimento por serviço, colados um
// no outro (financeiro, ficha e Google continuam por serviço); a folga
// (bufferMinutes) só depois do último. O WhatsApp manda uma mensagem só para
// a visita inteira (ver visitOf em whatsapp-automation.ts).
//
// Duas camadas contra double-booking (item 26 do escopo):
//   1) Transação SERIALIZABLE que confere overlap explicitamente antes de inserir.
//   2) EXCLUDE CONSTRAINT no Postgres (prisma/manual-sql/001_appointment_no_overlap.sql),
//      que é quem realmente garante a invariante mesmo se este código tiver um bug.
// Conflito de serialização: tenta de novo uma vez (padrão para SERIALIZABLE).
async function insertVisit(
  input: CreateVisitInput,
  services: Awaited<ReturnType<typeof loadServices>>,
  start: Date,
  source: 'PUBLIC_SITE' | 'INTERNAL',
) {
  let cursor = start.getTime();
  const periods = services.map((service, index) => {
    const startAt = new Date(cursor);
    cursor += service.durationMinutes * 60_000;
    if (index === services.length - 1) cursor += service.bufferMinutes * 60_000;
    return { service, startAt, endAt: new Date(cursor) };
  });
  const visitEnd = new Date(cursor);

  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; ; attempt++) {
    try {
      const created = await prisma.$transaction(
        async (tx) => {
          const overlap = await tx.appointment.findFirst({
            where: { tenantId: input.tenantId, status: 'CONFIRMED', startAt: { lt: visitEnd }, endAt: { gt: start } },
            include: { customer: { select: { name: true } } },
          });
          if (overlap) {
            if (source === 'PUBLIC_SITE') throw new ConflictError('Este horário acabou de ser reservado por outra pessoa.');
            const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: input.tenantId } });
            throw new ConflictError(
              `Conflita com o atendimento de ${overlap.customer.name} às ${formatInTimeZone(overlap.startAt, tenant.timezone, 'HH:mm')}.`,
            );
          }
          const { customer } = await findOrCreateCustomer(tx, input.tenantId, input.customer);
          const rows = [];
          for (const period of periods) {
            rows.push(
              await tx.appointment.create({
                data: {
                  tenantId: input.tenantId,
                  customerId: customer.id,
                  serviceId: period.service.id,
                  startAt: period.startAt,
                  endAt: period.endAt,
                  notes: input.notes,
                  source,
                },
              }),
            );
          }
          return rows;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      const ids = created.map((a) => a.id);

      // WhatsApp só DEPOIS do commit e em segundo plano: quem agendou vê a
      // confirmação na tela na hora, sem esperar a fila de envio.
      onAppointmentCreated(input.tenantId, ids).catch((err) =>
        console.error('Falha no WhatsApp automático do agendamento', ids, err),
      );
      // Se o Google falhar aqui, a sincronização periódica reenvia (ver
      // reconcileAppointments em google-calendar.service.ts).
      for (const id of ids) {
        await syncAppointmentToGoogle(id).catch((err) => console.error('Falha ao criar evento no Google Agenda:', err));
      }
      return { created, visitEnd };
    } catch (err) {
      const isSerializationConflict = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034';
      if (isSerializationConflict && attempt < MAX_ATTEMPTS) continue;
      throw err;
    }
  }
}

// Agendamento pelo site: um ou mais serviços, só nos horários livres.
export async function createAppointment(input: CreateVisitInput) {
  const services = await loadServices(input.tenantId, input.serviceIds);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: input.tenantId } });
  const requestedStart = parseStart(input.startAt);

  // Nunca confia no horário/duração do cliente: confirma que o início pedido
  // ainda está entre os slots válidos para a soma dos serviços — a mesma
  // fonte de verdade usada para exibir a grade de horários.
  const dateStr = formatInTimeZone(requestedStart, tenant.timezone, 'yyyy-MM-dd');
  const { slots } = await computeAvailableSlots(input.tenantId, input.serviceIds, dateStr);
  if (!slots.some((slot) => slot.startAt === requestedStart.toISOString())) {
    throw new ConflictError('Este horário não está mais disponível. Escolha outro.');
  }

  const { created, visitEnd } = await insertVisit(input, services, requestedStart, 'PUBLIC_SITE');
  // Resposta minimizada de propósito (item 59 do escopo — LGPD): nada de ids
  // internos de tenant/customer, só o suficiente para a tela de confirmação.
  return {
    id: created[0].id,
    startAt: created[0].startAt,
    endAt: visitEnd,
    services: services.map((s) => ({ id: s.id, name: s.name, durationMinutes: s.durationMinutes })),
  };
}

// Agendamento pelo painel, inclusive encaixe: qualquer horário — fora do
// expediente, sem a antecedência mínima do site —, porque quem marca é a
// própria clínica. Sobrepor outro atendimento confirmado continua proibido.
export async function createInternalAppointments(input: CreateVisitInput) {
  const services = await loadServices(input.tenantId, input.serviceIds);
  const { created } = await insertVisit(input, services, parseStart(input.startAt), 'INTERNAL');
  return { ids: created.map((a) => a.id) };
}

interface ListAppointmentsInput {
  tenantId: string;
  from?: string;
  to?: string;
}

// Usado pela agenda do painel administrativo (item pendente da Fase 1: hoje
// a única forma de ver os agendamentos é consultando o banco direto). Sem
// from/to, mostra os próximos agendamentos confirmados a partir de agora —
// o caso de uso mais comum ao abrir a agenda no dia a dia.
export async function listAppointments({ tenantId, from, to }: ListAppointmentsInput) {
  const startAt: Record<string, Date> = {};
  if (from) startAt.gte = new Date(from);
  if (to) startAt.lte = new Date(to);
  if (!from && !to) startAt.gte = new Date();

  const appointments = await prisma.appointment.findMany({
    where: { tenantId, startAt },
    orderBy: { startAt: 'asc' },
    include: {
      customer: { select: { name: true, whatsapp: true } },
      service: { select: { id: true, name: true, durationMinutes: true, priceCents: true } },
    },
  });

  return appointments.map((appt) => ({
    id: appt.id,
    startAt: appt.startAt,
    endAt: appt.endAt,
    status: appt.status,
    notes: appt.notes,
    customerId: appt.customerId,
    customer: appt.customer,
    service: appt.service,
    // Sem estes dois, o selo "Paciente confirmou ✓" da agenda nunca aparecia.
    confirmationSentAt: appt.confirmationSentAt,
    clientConfirmedAt: appt.clientConfirmedAt,
    chargedCents: appt.chargedCents,
    paymentMethod: appt.paymentMethod,
    paymentNote: appt.paymentNote,
  }));
}

// Transição de status genérica (agenda do painel administrativo): cobre
// cancelar, marcar como concluído/não compareceu, e reverter para
// confirmado. cancelledAt só é preenchido/limpo em função do status virar ou
// deixar de ser CANCELLED — mantém o campo como fonte de verdade de "quando
// foi cancelado" mesmo que o status mude de novo depois.
export async function updateAppointmentStatus(
  tenantId: string,
  appointmentId: string,
  status: AppointmentStatus,
) {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId },
  });
  if (!appointment) {
    throw new NotFoundError('Agendamento não encontrado.');
  }

  const previousStatus = appointment.status;

  const updated = await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      status,
      cancelledAt: status === 'CANCELLED' ? new Date() : null,
    },
    include: {
      customer: { select: { name: true, whatsapp: true } },
      service: { select: { id: true, name: true, durationMinutes: true } },
    },
  });

  // Ficha de paciente (módulo de acompanhamento): todo atendimento concluído
  // vira um ProcedureRecord + retornos automáticos, configurados por serviço
  // (Service.returnOffsetDays). Roda fora da transação de update do
  // agendamento de propósito — se isso falhar, a mudança de status (a ação
  // que a recepção pediu) já foi salva; não faz sentido derrubar ela por
  // causa de um efeito colateral.
  if (status === 'COMPLETED') {
    await createProcedureRecordForAppointment(prisma, {
      tenantId,
      appointmentId: updated.id,
      customerId: updated.customerId,
      serviceId: updated.serviceId,
      performedAt: updated.startAt,
    }).catch((err) => console.error('Falha ao gerar registro de procedimento/retornos:', err));
  }

  // previousStatus !== 'CANCELLED': evita reenviar o aviso se a rota for
  // chamada de novo com o mesmo status (idempotência), já que o cliente já
  // foi avisado da primeira vez.
  if (status === 'CANCELLED' && previousStatus !== 'CANCELLED') {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    await sendCancellationWhatsapp({
      whatsapp: updated.customer.whatsapp,
      customerName: updated.customer.name,
      serviceName: updated.service.name,
      startAt: updated.startAt,
      timezone: tenant.timezone,
    }).catch((err) => console.error('Falha ao enviar aviso de cancelamento por WhatsApp:', err));
  }

  // Cancelar apaga o evento do Google; reverter para confirmado recria.
  // Fora do if acima de propósito — syncAppointmentToGoogle decide pelo
  // status atual, então cobre as duas direções com a mesma chamada.
  await syncAppointmentToGoogle(updated.id).catch((err) =>
    console.error('Falha ao atualizar evento no Google Agenda:', err),
  );

  return updated;
}

interface ListBlockedTimesInput {
  tenantId: string;
  from?: string;
  to?: string;
}

export async function listBlockedTimes({ tenantId, from, to }: ListBlockedTimesInput) {
  const blockedTimes = await prisma.blockedTime.findMany({
    where: {
      tenantId,
      ...(to ? { startAt: { lt: new Date(to) } } : {}),
      endAt: { gt: from ? new Date(from) : new Date() },
    },
    orderBy: { startAt: 'asc' },
    select: { id: true, startAt: true, endAt: true, reason: true, source: true },
  });
  return blockedTimes;
}

// Bloqueio manual (almoço, compromisso, folga): o período some dos horários
// do site na hora — computeAvailableSlots já trata BlockedTime como ocupado.
// Atendimentos já marcados no período continuam valendo; o bloqueio só
// impede novos agendamentos pelo site.
export async function createBlockedTime(tenantId: string, input: { startAt: string; endAt: string; reason?: string }) {
  const startAt = parseStart(input.startAt);
  const endAt = parseStart(input.endAt);
  if (endAt <= startAt) {
    throw new AppError('O fim do bloqueio precisa ser depois do início.', 422, 'INVALID_RANGE');
  }
  if (endAt.getTime() - startAt.getTime() > 31 * 24 * 60 * 60_000) {
    throw new AppError('Bloqueie no máximo 31 dias de uma vez.', 422, 'INVALID_RANGE');
  }
  return prisma.blockedTime.create({
    data: { tenantId, startAt, endAt, reason: input.reason?.trim() || null, source: 'MANUAL' },
    select: { id: true, startAt: true, endAt: true, reason: true, source: true },
  });
}

// Só bloqueios feitos no painel: os do Google Agenda saem apagando o
// compromisso lá (a sincronização recriaria o bloqueio).
export async function deleteBlockedTime(tenantId: string, id: string) {
  const { count } = await prisma.blockedTime.deleteMany({ where: { id, tenantId, source: 'MANUAL' } });
  if (!count) throw new NotFoundError('Bloqueio não encontrado.');
}

interface CheckoutInput {
  items: { id: string; chargedCents: number }[];
  paymentMethod: string;
  paymentNote?: string;
}

// Fechamento da comanda: grava quanto foi cobrado em cada serviço e como foi
// pago, e conclui os atendimentos (o que também gera ficha/retornos — ver
// updateAppointmentStatus). Cancelados não entram.
export async function checkoutAppointments(tenantId: string, input: CheckoutInput) {
  const ids = input.items.map((i) => i.id);
  const found = await prisma.appointment.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, status: true } });
  if (found.length !== ids.length) throw new NotFoundError('Agendamento não encontrado.');
  if (found.some((a) => a.status === 'CANCELLED')) {
    throw new ConflictError('Um dos serviços da comanda está cancelado. Recarregue a agenda.');
  }

  await prisma.$transaction(
    input.items.map((item) =>
      prisma.appointment.update({
        where: { id: item.id },
        data: { chargedCents: item.chargedCents, paymentMethod: input.paymentMethod, paymentNote: input.paymentNote ?? null },
      }),
    ),
  );
  for (const appt of found) {
    if (appt.status !== 'COMPLETED') await updateAppointmentStatus(tenantId, appt.id, 'COMPLETED');
  }
  return { ids };
}
