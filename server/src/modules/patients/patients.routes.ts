import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler';
import { requireAuth, requireAuthFromHeaderOrQuery, requireRole } from '../auth/auth.middleware';
import { recordAudit } from '../audit/audit.service';
import {
  addPatientPhoto,
  createPatient,
  getPatientById,
  getPatientPhotoFile,
  listPatients,
  removePatientPhoto,
  updatePatient,
} from './patients.service';
import { getUpcomingReminders, markReturnReminderStatus } from './reminders.service';
import { sendBirthdayWhatsapp, sendReturnReminderWhatsapp } from './notifications.service';
import { createFicha, deleteFicha, listFichas, updateFicha } from './fichas.service';

export const patientsRouter = Router();

// Precisa estar registrada ANTES do router.use(requireAuth, ...) abaixo:
// essa rota tem sua PRÓPRIA cadeia de auth (requireAuthFromHeaderOrQuery,
// que aceita token por query string — <img src> não manda header
// Authorization), e o Express resolve middlewares/rotas na ordem de
// registro. Se ficasse depois do .use(), o requireAuth "de header only"
// dali barraria a requisição antes mesmo de chegar aqui.
patientsRouter.get(
  '/:id/photos/:photoId/file',
  requireAuthFromHeaderOrQuery,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const { buffer, mimeType } = await getPatientPhotoFile(req.tenant.id, req.params.photoId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  }),
);

// Acesso restrito às fichas (pedido explícito — LGPD): as duas funções do
// dia a dia (ADMIN e RECEPTION) entram no módulo, mas RECEPTION recebe uma
// versão sem notas clínicas nem galeria de fotos (ver getPatientById route
// abaixo) — só o suficiente pra atender/agendar o paciente. Upload/remoção
// de foto e disparo de WhatsApp exigem ADMIN explicitamente em cada rota.
patientsRouter.use(requireAuth, requireRole('ADMIN', 'RECEPTION'));

const listQuerySchema = z.object({ search: z.string().trim().min(1).optional() });

patientsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { search } = listQuerySchema.parse(req.query);
    const patients = await listPatients({ tenantId: req.tenant.id, search });
    res.json({ patients });
  }),
);

// LGPD: toda visualização de ficha individual gera um registro de auditoria
// próprio (AuditAction.VIEW) — diferente do resto do sistema, que só audita
// escrita (ver audit.middleware.ts). Um prontuário sendo consultado é, por
// si só, um evento relevante de rastrear.
patientsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const patient = await getPatientById({ tenantId: req.tenant.id, patientId: req.params.id });

    recordAudit({
      tenantId: req.tenant.id,
      userId: req.user!.id,
      userName: req.user!.name,
      action: 'VIEW',
      entityType: 'patient',
      entityId: patient.id,
      entityLabel: patient.name,
      method: 'GET',
      path: '/patients/:id',
    }).catch((err) => req.log?.error({ err }, 'Falha ao gravar log de auditoria (visualização de ficha)'));

    if (req.user!.role === 'RECEPTION') {
      const { notes: _notes, photos: _photos, ...restricted } = patient;
      res.json({ patient: restricted, restricted: true });
      return;
    }

    res.json({ patient, restricted: false });
  }),
);

const patientInputSchema = z.object({
  name: z.string().min(2, 'Informe o nome completo.'),
  whatsapp: z.string().min(10, 'Informe um WhatsApp válido com DDD.'),
  phone: z.string().min(8).nullable().optional(),
  email: z.string().email().nullable().optional(),
  birthDate: z.string().nullable().optional(),
  profilePhotoUrl: z.string().nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

patientsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = patientInputSchema.parse(req.body);
    const patient = await createPatient(req.tenant.id, input);
    res.status(201).json({ patient });
  }),
);

patientsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = patientInputSchema.partial().parse(req.body);
    const patient = await updatePatient(req.tenant.id, req.params.id, input);
    res.json({ patient });
  }),
);

const photoInputSchema = z.object({
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  base64Data: z.string().min(1),
  category: z.enum(['BEFORE', 'AFTER', 'EVOLUTION', 'OTHER']),
  notes: z.string().max(500).nullable().optional(),
  takenAt: z.string().min(1),
  procedureRecordId: z.string().nullable().optional(),
});

patientsRouter.post(
  '/:id/photos',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const input = photoInputSchema.parse(req.body);
    const photo = await addPatientPhoto({
      tenantId: req.tenant.id,
      customerId: req.params.id,
      uploadedByUserId: req.user!.id,
      ...input,
    });
    res.status(201).json({ photo: { id: photo.id, category: photo.category, takenAt: photo.takenAt, notes: photo.notes, createdAt: photo.createdAt } });
  }),
);

patientsRouter.delete(
  '/:id/photos/:photoId',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    await removePatientPhoto(req.tenant.id, req.params.photoId);
    res.status(204).end();
  }),
);

patientsRouter.post(
  '/:id/notify-birthday',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const result = await sendBirthdayWhatsapp(req.tenant.id, req.params.id);
    res.json(result);
  }),
);

// --- Fichas de acompanhamento clínico (anamnese, ficha de bioestimulador de
// colágeno etc.) — item mais sensível de todo o módulo (histórico de saúde,
// não só contato/agenda), por isso ADMIN em toda rota, sem exceção nenhuma
// pra RECEPTION (diferente da ficha básica do paciente, que RECEPTION acessa
// numa versão restrita). Toda leitura E escrita gera auditoria própria — o
// resto do sistema só audita escrita (ver audit.middleware.ts), mas dado
// clínico pede rastro também de quem CONSULTOU, não só de quem alterou.
const fichaFieldSchema = z.object({ label: z.string().min(1).max(200), value: z.string().max(4000) });
const fichaInputSchema = z.object({
  type: z.string().min(1).max(120),
  fields: z.array(fichaFieldSchema).max(60),
  notes: z.string().max(4000).nullable().optional(),
});

patientsRouter.get(
  '/:id/fichas',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const fichas = await listFichas({ tenantId: req.tenant.id, patientId: req.params.id });

    recordAudit({
      tenantId: req.tenant.id,
      userId: req.user!.id,
      userName: req.user!.name,
      action: 'VIEW',
      entityType: 'patient_ficha',
      entityId: req.params.id,
      entityLabel: `${fichas.length} ficha(s)`,
      method: 'GET',
      path: '/patients/:id/fichas',
    }).catch((err) => req.log?.error({ err }, 'Falha ao gravar log de auditoria (visualização de fichas)'));

    res.json({ fichas });
  }),
);

patientsRouter.post(
  '/:id/fichas',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const input = fichaInputSchema.parse(req.body);
    const ficha = await createFicha({ tenantId: req.tenant.id, patientId: req.params.id }, req.user!.id, input);
    res.status(201).json({ ficha });
  }),
);

patientsRouter.patch(
  '/:id/fichas/:fichaId',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const input = fichaInputSchema.partial().parse(req.body);
    const ficha = await updateFicha({ tenantId: req.tenant.id, patientId: req.params.id }, req.params.fichaId, input);
    res.json({ ficha });
  }),
);

patientsRouter.delete(
  '/:id/fichas/:fichaId',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    await deleteFicha({ tenantId: req.tenant.id, patientId: req.params.id }, req.params.fichaId);
    res.status(204).end();
  }),
);

export const remindersRouter = Router();
remindersRouter.use(requireAuth, requireRole('ADMIN', 'RECEPTION'));

const remindersQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(180).default(30) });

remindersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { days } = remindersQuerySchema.parse(req.query);
    const reminders = await getUpcomingReminders(req.tenant.id, days);
    res.json({ reminders });
  }),
);

const reminderStatusSchema = z.object({ status: z.enum(['DONE', 'DISMISSED']) });

remindersRouter.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const { status } = reminderStatusSchema.parse(req.body);
    const reminder = await markReturnReminderStatus(req.tenant.id, req.params.id, status);
    res.json({ reminder });
  }),
);

remindersRouter.post(
  '/:id/notify-whatsapp',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const result = await sendReturnReminderWhatsapp(req.tenant.id, req.params.id);
    res.json(result);
  }),
);

