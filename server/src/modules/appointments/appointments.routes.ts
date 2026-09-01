import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler';
import { bookingRateLimiter } from '../../middleware/rate-limit';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import { createAppointment, listAppointments, updateAppointmentStatus } from './appointments.service';

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

const createSchema = z.object({
  serviceId: z.string().min(1),
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
    const input = createSchema.parse(req.body);
    const appointment = await createAppointment({ tenantId: req.tenant.id, ...input });
    res.status(201).json({ appointment });
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
