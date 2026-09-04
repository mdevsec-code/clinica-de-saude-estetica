import { Prisma, type AppointmentStatus } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import { prisma } from '../../lib/prisma';
import { AppError, ConflictError, NotFoundError } from '../../utils/errors';
import { findOrCreateCustomer } from '../customers/customers.service';
import { computeAvailableSlots } from '../availability/availability.service';
import { createProcedureRecordForAppointment } from '../patients/procedures.service';

interface CreateAppointmentInput {
  tenantId: string;
  serviceId: string;
  startAt: string; // ISO 8601
  customer: { name: string; whatsapp: string; email?: string };
  notes?: string;
}

// Cria o agendamento com duas camadas de proteção contra double-booking
// (item 26 do escopo):
//   1) Transação SERIALIZABLE que rejeita conflitos de escrita concorrente e
//      confere overlap explicitamente antes de inserir.
//   2) EXCLUDE CONSTRAINT no Postgres (prisma/manual-sql/001_appointment_no_overlap.sql),
//      que é quem realmente garante a invariante mesmo se este código tiver um bug.
// Se a camada 1 detectar conflito de serialização, tenta novamente uma vez —
// é o padrão recomendado para SERIALIZABLE no Postgres.
export async function createAppointment(input: CreateAppointmentInput) {
  const service = await prisma.service.findFirst({
    where: { id: input.serviceId, tenantId: input.tenantId, active: true },
  });
  if (!service) {
    throw new NotFoundError('Serviço não encontrado.');
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: input.tenantId } });
  const requestedStart = new Date(input.startAt);
  if (Number.isNaN(requestedStart.getTime())) {
    throw new AppError('Horário inválido.', 422, 'INVALID_DATE');
  }

  const dateStr = formatInTimeZone(requestedStart, tenant.timezone, 'yyyy-MM-dd');

  // Nunca confia no endAt calculado pelo cliente: recalcula a partir da duração
  // real do serviço e confirma que o horário pedido ainda está entre os slots
  // válidos — a mesma fonte de verdade usada para exibir a grade de horários.
  const { slots } = await computeAvailableSlots(input.tenantId, input.serviceId, dateStr);
  const matchingSlot = slots.find((slot) => slot.startAt === requestedStart.toISOString());
  if (!matchingSlot) {
    throw new ConflictError('Este horário não está mais disponível. Escolha outro.');
  }

  const startAt = new Date(matchingSlot.startAt);
  const endAt = new Date(matchingSlot.endAt);

  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const overlap = await tx.appointment.findFirst({
            where: {
              tenantId: input.tenantId,
              status: 'CONFIRMED',
              startAt: { lt: endAt },
              endAt: { gt: startAt },
            },
          });
          if (overlap) {
            throw new ConflictError('Este horário acabou de ser reservado por outra pessoa.');
          }

          const customer = await findOrCreateCustomer(tx, input.tenantId, input.customer);

          const created = await tx.appointment.create({
            data: {
              tenantId: input.tenantId,
              customerId: customer.id,
              serviceId: service.id,
              startAt,
              endAt,
              notes: input.notes,
              source: 'PUBLIC_SITE',
            },
          });

          // Resposta minimizada de propósito (item 59 do escopo — LGPD):
          // o cliente que acabou de agendar não precisa receber de volta
          // ids internos de tenant/customer, só o suficiente para exibir a
          // confirmação na tela.
          return {
            id: created.id,
            startAt: created.startAt,
            endAt: created.endAt,
            service: { id: service.id, name: service.name, durationMinutes: service.durationMinutes },
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err) {
      const isSerializationConflict =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034';
      if (isSerializationConflict && attempt < MAX_ATTEMPTS) {
        continue;
      }
      throw err;
    }
  }

  throw new ConflictError();
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
      service: { select: { id: true, name: true, durationMinutes: true } },
    },
  });

  return appointments.map((appt) => ({
    id: appt.id,
    startAt: appt.startAt,
    endAt: appt.endAt,
    status: appt.status,
    notes: appt.notes,
    customer: appt.customer,
    service: appt.service,
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

  return updated;
}
