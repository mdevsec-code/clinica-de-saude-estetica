import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../utils/errors';
import type { Prisma } from '@prisma/client';

export interface FichaField {
  label: string;
  value: string;
}

interface PatientContext {
  tenantId: string;
  patientId: string;
}

export async function listFichas({ tenantId, patientId }: PatientContext) {
  const patient = await prisma.customer.findFirst({ where: { id: patientId, tenantId } });
  if (!patient) throw new NotFoundError('Paciente não encontrado.');

  return prisma.patientFicha.findMany({
    where: { tenantId, customerId: patientId },
    orderBy: { createdAt: 'desc' },
  });
}

interface FichaInput {
  type: string;
  fields: FichaField[];
  notes?: string | null;
}

export async function createFicha(
  { tenantId, patientId }: PatientContext,
  createdByUserId: string,
  input: FichaInput,
) {
  const patient = await prisma.customer.findFirst({ where: { id: patientId, tenantId } });
  if (!patient) throw new NotFoundError('Paciente não encontrado.');

  return prisma.patientFicha.create({
    data: {
      tenantId,
      customerId: patientId,
      type: input.type,
      fields: input.fields as unknown as Prisma.InputJsonValue,
      notes: input.notes ?? null,
      createdByUserId,
    },
  });
}

export async function updateFicha(
  { tenantId, patientId }: PatientContext,
  fichaId: string,
  input: Partial<FichaInput>,
) {
  const ficha = await prisma.patientFicha.findFirst({ where: { id: fichaId, tenantId, customerId: patientId } });
  if (!ficha) throw new NotFoundError('Ficha não encontrada.');

  return prisma.patientFicha.update({
    where: { id: ficha.id },
    data: {
      type: input.type ?? undefined,
      fields: input.fields ? (input.fields as unknown as Prisma.InputJsonValue) : undefined,
      notes: input.notes === undefined ? undefined : input.notes,
    },
  });
}

export async function deleteFicha({ tenantId, patientId }: PatientContext, fichaId: string) {
  const ficha = await prisma.patientFicha.findFirst({ where: { id: fichaId, tenantId, customerId: patientId } });
  if (!ficha) throw new NotFoundError('Ficha não encontrada.');

  await prisma.patientFicha.delete({ where: { id: ficha.id } });
}
