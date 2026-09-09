import { prisma } from '../../lib/prisma';
import { AppError, NotFoundError } from '../../utils/errors';
import { deleteFichaFile, isSupportedFichaFileMime, readFichaFile, saveFichaFile } from '../../lib/file-storage';
import type { Prisma } from '@prisma/client';

export interface FichaField {
  label: string;
  value: string;
  section?: string | null;
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

interface FichaFileInput {
  mimeType: string;
  base64Data: string;
  fileName: string;
}

interface FichaInput {
  type: string;
  fields: FichaField[];
  notes?: string | null;
  // Ficha "digitalizada": upload de um arquivo (PDF/foto de um formulário já
  // preenchido em papel) em vez de preencher os campos manualmente. Uma
  // ficha nasce de UM dos dois caminhos — nunca precisa ser as duas coisas
  // ao mesmo tempo, mas precisa ser ao menos uma (ver validação abaixo).
  file?: FichaFileInput | null;
}

export async function createFicha(
  { tenantId, patientId }: PatientContext,
  createdByUserId: string,
  input: FichaInput,
) {
  const patient = await prisma.customer.findFirst({ where: { id: patientId, tenantId } });
  if (!patient) throw new NotFoundError('Paciente não encontrado.');

  if (!input.fields.length && !input.file) {
    throw new AppError('Preencha ao menos um campo ou envie um arquivo.', 400);
  }

  let fileStorageKey: string | null = null;
  let fileMimeType: string | null = null;
  let fileName: string | null = null;

  if (input.file) {
    if (!isSupportedFichaFileMime(input.file.mimeType)) {
      throw new AppError('Formato de arquivo não suportado (use PDF, JPEG, PNG ou WebP).', 400);
    }
    fileStorageKey = await saveFichaFile(tenantId, patientId, input.file.mimeType, input.file.base64Data);
    fileMimeType = input.file.mimeType;
    fileName = input.file.fileName;
  }

  return prisma.patientFicha.create({
    data: {
      tenantId,
      customerId: patientId,
      type: input.type,
      fields: input.fields as unknown as Prisma.InputJsonValue,
      notes: input.notes ?? null,
      fileStorageKey,
      fileMimeType,
      fileName,
      createdByUserId,
    },
  });
}

export async function getFichaFile({ tenantId, patientId }: PatientContext, fichaId: string) {
  const ficha = await prisma.patientFicha.findFirst({ where: { id: fichaId, tenantId, customerId: patientId } });
  if (!ficha || !ficha.fileStorageKey || !ficha.fileMimeType) throw new NotFoundError('Arquivo não encontrado.');

  const buffer = await readFichaFile(ficha.fileStorageKey);
  return { buffer, mimeType: ficha.fileMimeType, fileName: ficha.fileName };
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
  if (ficha.fileStorageKey) await deleteFichaFile(ficha.fileStorageKey);
}
