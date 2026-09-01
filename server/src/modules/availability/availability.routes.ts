import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler';
import { computeAvailableSlots } from './availability.service';

export const availabilityRouter = Router();

const querySchema = z.object({
  serviceId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD'),
});

availabilityRouter.get(
  '/slots',
  asyncHandler(async (req, res) => {
    const { serviceId, date } = querySchema.parse(req.query);
    const result = await computeAvailableSlots(req.tenant.id, serviceId, date);
    res.json(result);
  }),
);
