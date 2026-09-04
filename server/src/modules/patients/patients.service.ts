import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../utils/errors';
import { deletePatientPhoto, isSupportedImageMime, readPatientPhoto, savePatientPhoto } from '../../lib/file-storage';
import type { PatientPhotoCategory } from '@prisma/client';

interface ListPatientsInput {
  tenantId: string;
  search?: string;
}

// Lista enxuta pra tela de listagem — nada de fotos/notas/histórico aqui
// (ver getPatientById pra isso), só o suficiente pra achar o paciente certo.
export async function listPatients({ tenantId, search }: ListPatientsInput) {
  const customers = await prisma.customer.findMany({
    where: {
      tenantId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { whatsapp: { contains: search } },
              { phone: { contains: search } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { appointments: true, procedureRecords: true } },
    },
  });

  return customers.map((c) => ({
    id: c.id,
    name: c.name,
    whatsapp: c.whatsapp,
    phone: c.phone,
    email: c.email,
    birthDate: c.birthDate,
    profilePhotoUrl: c.profilePhotoUrl,
    appointmentCount: c._count.appointments,
    procedureCount: c._count.procedureRecords,
  }));
}

interface PatientContext {
  tenantId: string;
  patientId: string;
}

// Ficha completa: dados cadastrais, histórico de atendimentos, procedimentos
// com seus retornos, galeria de fotos e o "financeiro" do paciente — que
// aqui é derivado dos próprios atendimentos concluídos (preço do serviço no
// momento em que foi marcado concluído), não uma tabela de cobrança à parte:
// a clínica já não tem um conceito de "fatura do paciente" separado de
// atendimento concluído, então inventar uma segunda fonte de verdade só
// criaria risco de os dois divergirem.
export async function getPatientById({ tenantId, patientId }: PatientContext) {
  const customer = await prisma.customer.findFirst({
    where: { id: patientId, tenantId },
  });
  if (!customer) throw new NotFoundError('Paciente não encontrado.');

  const [appointments, procedureRecords, photos] = await Promise.all([
    prisma.appointment.findMany({
      where: { customerId: patientId, tenantId },
      orderBy: { startAt: 'desc' },
      include: { service: { select: { id: true, name: true, priceCents: true } } },
    }),
    prisma.procedureRecord.findMany({
      where: { customerId: patientId, tenantId },
      orderBy: { performedAt: 'desc' },
      include: {
        service: { select: { id: true, name: true } },
        returnReminders: { orderBy: { dueAt: 'asc' } },
      },
    }),
    prisma.patientPhoto.findMany({
      where: { customerId: patientId, tenantId },
      orderBy: { takenAt: 'desc' },
      select: { id: true, category: true, notes: true, takenAt: true, mimeType: true, createdAt: true, procedureRecordId: true },
    }),
  ]);

  const completed = appointments.filter((a) => a.status === 'COMPLETED');
  const financialRecords = completed.map((a) => ({
    appointmentId: a.id,
    date: a.startAt,
    serviceName: a.service.name,
    amountCents: a.service.priceCents ?? 0,
  }));
  const totalSpentCents = financialRecords.reduce((sum, r) => sum + r.amountCents, 0);

  return {
    id: customer.id,
    name: customer.name,
    whatsapp: customer.whatsapp,
    phone: customer.phone,
    email: customer.email,
    birthDate: customer.birthDate,
    profilePhotoUrl: customer.profilePhotoUrl,
    notes: customer.notes,
    createdAt: customer.createdAt,
    appointments: appointments.map((a) => ({
      id: a.id,
      startAt: a.startAt,
      endAt: a.endAt,
      status: a.status,
      notes: a.notes,
      service: a.service,
    })),
    procedureRecords: procedureRecords.map((p) => ({
      id: p.id,
      serviceId: p.serviceId,
      serviceName: p.service.name,
      performedAt: p.performedAt,
      notes: p.notes,
      returnReminders: p.returnReminders,
    })),
    photos,
    financial: { records: financialRecords, totalSpentCents },
  };
}

interface UpsertPatientInput {
  name: string;
  whatsapp: string;
  phone?: string | null;
  email?: string | null;
  birthDate?: string | null;
  profilePhotoUrl?: string | null;
  notes?: string | null;
}

export async function createPatient(tenantId: string, input: UpsertPatientInput) {
  return prisma.customer.create({
    data: {
      tenantId,
      name: input.name,
      whatsapp: input.whatsapp,
      phone: input.phone ?? null,
      email: input.email ?? null,
      birthDate: input.birthDate ? new Date(input.birthDate) : null,
      profilePhotoUrl: input.profilePhotoUrl ?? null,
      notes: input.notes ?? null,
    },
  });
}

export async function updatePatient(tenantId: string, patientId: string, input: Partial<UpsertPatientInput>) {
  const existing = await prisma.customer.findFirst({ where: { id: patientId, tenantId } });
  if (!existing) throw new NotFoundError('Paciente não encontrado.');

  return prisma.customer.update({
    where: { id: patientId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.whatsapp !== undefined ? { whatsapp: input.whatsapp } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.birthDate !== undefined ? { birthDate: input.birthDate ? new Date(input.birthDate) : null } : {}),
      ...(input.profilePhotoUrl !== undefined ? { profilePhotoUrl: input.profilePhotoUrl } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  });
}

interface AddPhotoInput {
  tenantId: string;
  customerId: string;
  uploadedByUserId: string;
  mimeType: string;
  base64Data: string;
  category: PatientPhotoCategory;
  notes?: string | null;
  takenAt: string;
  procedureRecordId?: string | null;
}

export async function addPatientPhoto(input: AddPhotoInput) {
  const customer = await prisma.customer.findFirst({ where: { id: input.customerId, tenantId: input.tenantId } });
  if (!customer) throw new NotFoundError('Paciente não encontrado.');

  if (!isSupportedImageMime(input.mimeType)) {
    throw new NotFoundError('Formato de imagem não suportado (use JPEG, PNG ou WebP).');
  }

  const storageKey = await savePatientPhoto(input.tenantId, input.customerId, input.mimeType, input.base64Data);

  return prisma.patientPhoto.create({
    data: {
      tenantId: input.tenantId,
      customerId: input.customerId,
      procedureRecordId: input.procedureRecordId ?? null,
      storageKey,
      mimeType: input.mimeType,
      category: input.category,
      notes: input.notes ?? null,
      takenAt: new Date(input.takenAt),
      uploadedByUserId: input.uploadedByUserId,
    },
  });
}

export async function getPatientPhotoFile(tenantId: string, photoId: string) {
  const photo = await prisma.patientPhoto.findFirst({ where: { id: photoId, tenantId } });
  if (!photo) throw new NotFoundError('Foto não encontrada.');

  const buffer = await readPatientPhoto(photo.storageKey);
  return { buffer, mimeType: photo.mimeType };
}

export async function removePatientPhoto(tenantId: string, photoId: string) {
  const photo = await prisma.patientPhoto.findFirst({ where: { id: photoId, tenantId } });
  if (!photo) throw new NotFoundError('Foto não encontrada.');

  await prisma.patientPhoto.delete({ where: { id: photo.id } });
  await deletePatientPhoto(photo.storageKey);
}
