import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler';
import { AppError } from '../../utils/errors';
import { bookingRateLimiter } from '../../middleware/rate-limit';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import {
  createAppointment,
  createBlockedTime,
  createInternalAppointments,
  deleteBlockedTime,
  listAppointments,
  listBlockedTimes,
  updateAppointmentStatus,
} from './appointments.service';

export const appointmentsRouter = Router();

const listQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// Agenda do painel administrativo — ADMIN e RECEPTION (o dia a dia de
// agendamentos não é uma decisão só de dono da clínica, ao contrário do
// cadastro de categorias/serviços em catalog.routes.ts).
appointmentsRouter.get(
  '/',
  requireAuth,
  requireRole('ADMIN', 'RECEPTION'),
  asyncHandler(async (req, res) => {
    const { from, to } = listQuerySchema.parse(req.query);
    const appointments = await listAppointments({ tenantId: req.tenant.id, from, to });
    res.json({ appointments });
  }),
);

// Bloqueios da agenda (hoje: compromissos importados do Google Agenda) para
// exibir junto dos atendimentos no painel. Rota separada de GET / em vez de
// misturar no mesmo array: bloqueio não tem paciente, serviço nem status.
appointmentsRouter.get(
  '/blocked-times',
  requireAuth,
  requireRole('ADMIN', 'RECEPTION'),
  asyncHandler(async (req, res) => {
    const { from, to } = listQuerySchema.parse(req.query);
    const blockedTimes = await listBlockedTimes({ tenantId: req.tenant.id, from, to });
    res.json({ blockedTimes });
  }),
);

const blockSchema = z.object({
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  reason: z.string().max(200).optional(),
});

appointmentsRouter.post(
  '/blocked-times',
  requireAuth,
  requireRole('ADMIN', 'RECEPTION'),
  asyncHandler(async (req, res) => {
    const blockedTime = await createBlockedTime(req.tenant.id, blockSchema.parse(req.body));
    res.status(201).json({ blockedTime });
  }),
);

appointmentsRouter.delete(
  '/blocked-times/:id',
  requireAuth,
  requireRole('ADMIN', 'RECEPTION'),
  asyncHandler(async (req, res) => {
    await deleteBlockedTime(req.tenant.id, req.params.id);
    res.status(204).end();
  }),
);

const createSchema = z.object({
  // serviceIds (vários serviços numa visita); serviceId sozinho continua
  // aceito para quem estiver com a versão antiga do site em cache.
  serviceIds: z.array(z.string().min(1)).min(1).max(10).optional(),
  serviceId: z.string().min(1).optional(),
  startAt: z.string().min(1),
  notes: z.string().max(500).optional(),
  customer: z.object({
    name: z.string().min(2, 'Informe seu nome completo.'),
    whatsapp: z
      .string()
      .min(10, 'Informe um WhatsApp válido com DDD.')
      .regex(/^\+?\d{10,15}$/, 'Use apenas números, com DDD.'),
    email: z.string().email().optional(),
  }),
});

appointmentsRouter.post(
  '/',
  bookingRateLimiter,
  asyncHandler(async (req, res) => {
    const { serviceId, serviceIds, ...input } = createSchema.parse(req.body);
    const ids = serviceIds ?? (serviceId ? [serviceId] : []);
    if (!ids.length) throw new AppError('Escolha ao menos um serviço.', 422, 'VALIDATION_ERROR');
    const appointment = await createAppointment({ tenantId: req.tenant.id, serviceIds: ids, ...input });
    res.status(201).json({ appointment });
  }),
);

// Agendamento pelo painel (com encaixe e vários serviços) — ver
// createInternalAppointments.
const internalSchema = createSchema.omit({ serviceId: true, serviceIds: true }).extend({
  serviceIds: z.array(z.string().min(1)).min(1, 'Escolha ao menos um serviço.').max(10),
  startAt: z.string().datetime({ offset: true }),
});

appointmentsRouter.post(
  '/internal',
  requireAuth,
  requireRole('ADMIN', 'RECEPTION'),
  asyncHandler(async (req, res) => {
    const input = internalSchema.parse(req.body);
    const result = await createInternalAppointments({ tenantId: req.tenant.id, ...input });
    res.status(201).json(result);
  }),
);

const statusSchema = z.object({
  status: z.enum(['CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']),
});

// Mudança de status exige autenticação (recepção/admin) — o cliente final
// cancela pelo WhatsApp por enquanto; self-service de cancelamento é uma
// fase futura.
appointmentsRouter.patch(
  '/:id/status',
  requireAuth,
  requireRole('ADMIN', 'RECEPTION'),
  asyncHandler(async (req, res) => {
    const { status } = statusSchema.parse(req.body);
    const appointment = await updateAppointmentStatus(req.tenant.id, req.params.id, status);
    res.json({ appointment });
  }),
);
