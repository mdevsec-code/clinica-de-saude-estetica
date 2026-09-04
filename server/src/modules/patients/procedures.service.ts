import { addDays } from 'date-fns';
import type { Prisma, PrismaClient } from '@prisma/client';

type TxClient = PrismaClient | Prisma.TransactionClient;

// Chamado a partir de updateAppointmentStatus (appointments.service.ts) só
// quando o status vira COMPLETED — nunca em CONFIRMED/CANCELLED/NO_SHOW.
// appointmentId é @unique em ProcedureRecord, então reverter e re-completar
// o mesmo agendamento (ex.: staff errou o clique) não duplica o registro,
// só devolve o já existente sem recriar retornos.
export async function createProcedureRecordForAppointment(
  tx: TxClient,
  input: { tenantId: string; appointmentId: string; customerId: string; serviceId: string; performedAt: Date },
) {
  const existing = await tx.procedureRecord.findUnique({ where: { appointmentId: input.appointmentId } });
  if (existing) return existing;

  const service = await tx.service.findUniqueOrThrow({ where: { id: input.serviceId } });

  const record = await tx.procedureRecord.create({
    data: {
      tenantId: input.tenantId,
      customerId: input.customerId,
      serviceId: input.serviceId,
      appointmentId: input.appointmentId,
      performedAt: input.performedAt,
    },
  });

  // Exemplo do pedido: Botox em 03/09 com returnOffsetDays [15, 122] gera
  // retornos em 18/09 (+15) e 03/01 (+122) — um ReturnReminder por offset,
  // congelando o offset usado (ver comentário no schema).
  if (service.returnOffsetDays.length > 0) {
    await tx.returnReminder.createMany({
      data: service.returnOffsetDays.map((offsetDays) => ({
        tenantId: input.tenantId,
        customerId: input.customerId,
        procedureRecordId: record.id,
        offsetDays,
        dueAt: addDays(input.performedAt, offsetDays),
      })),
    });
  }

  return record;
}
