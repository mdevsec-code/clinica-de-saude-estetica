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
