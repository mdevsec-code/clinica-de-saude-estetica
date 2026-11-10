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
  checkoutAppointments,
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
    // Aceita como a pessoa digitou ("(71) 9600-9884", "71 99600 9884"): só
    // os dígitos importam. Antes, espaço ou traço davam erro ao agendar.
    whatsapp: z.preprocess(
      (v) => (typeof v === 'string' ? v.replace(/\D/g, '') : v),
      z.string().regex(/^\d{10,15}$/, 'Informe um WhatsApp válido com DDD.'),
    ),
    // Campo de e-mail apagado chega como "" — é o mesmo que não informar.
    email: z.preprocess((v) => (typeof v === 'string' && !v.trim() ? undefined : v), z.string().trim().email('E-mail inválido.').optional()),
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

const PAYMENT_METHODS = ['DINHEIRO', 'PIX', 'DEBITO', 'CREDITO'] as const;
const checkoutSchema = z.object({
  items: z
    .array(z.object({ id: z.string().min(1), chargedCents: z.number().int().min(0).max(10_000_000) }))
    .min(1)
    .max(20),
  // Um método ("PIX") ou dois combinados ("PIX+CREDITO").
  paymentMethod: z
    .string()
    .refine((v) => v.split('+').length <= 2 && v.split('+').every((m) => (PAYMENT_METHODS as readonly string[]).includes(m)), 'Forma de pagamento inválida.'),
  paymentNote: z.string().max(300).optional(),
});

// Comanda: fecha a visita (um ou mais serviços) com valor e pagamento.
appointmentsRouter.post(
  '/checkout',
  requireAuth,
  requireRole('ADMIN', 'RECEPTION'),
  asyncHandler(async (req, res) => {
    const result = await checkoutAppointments(req.tenant.id, checkoutSchema.parse(req.body));
    res.json(result);
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
