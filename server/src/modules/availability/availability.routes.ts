import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler';
import { computeAvailableSlots } from './availability.service';

export const availabilityRouter = Router();

// serviceIds: vários serviços separados por vírgula; serviceId (um só)
// continua aceito para quem estiver com a versão antiga do site em cache.
const querySchema = z.object({
  serviceIds: z.string().min(1).optional(),
  serviceId: z.string().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD'),
});

availabilityRouter.get(
  '/slots',
  asyncHandler(async (req, res) => {
    const { serviceIds, serviceId, date } = querySchema.parse(req.query);
    const ids = (serviceIds ?? serviceId ?? '').split(',').filter(Boolean).slice(0, 10);
    const result = await computeAvailableSlots(req.tenant.id, ids, date);
    res.json(result);
  }),
);

// Dias (a partir de `from`) que têm ao menos um horário livre para os
// serviços escolhidos — o site só mostra esses na escolha do dia, em vez de
// deixar a paciente tocar num dia cheio/fechado e cair em "sem horários".
const daysQuerySchema = z.object({
  serviceIds: z.string().min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD'),
  days: z.coerce.number().int().min(1).max(42).default(21),
});

availabilityRouter.get(
  '/days',
  asyncHandler(async (req, res) => {
    const { serviceIds, from, days } = daysQuerySchema.parse(req.query);
    const ids = serviceIds.split(',').filter(Boolean).slice(0, 10);
    const start = new Date(`${from}T12:00:00Z`);
    const available: string[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10);
      const { slots } = await computeAvailableSlots(req.tenant.id, ids, date);
      if (slots.length) available.push(date);
    }
    res.json({ days: available });
  }),
);
