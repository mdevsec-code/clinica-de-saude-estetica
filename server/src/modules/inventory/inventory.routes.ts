import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import { adjustQuantity, createItem, listInventory, updateItem } from './inventory.service';

export const inventoryRouter = Router();
inventoryRouter.use(requireAuth, requireRole('ADMIN', 'RECEPTION'));

inventoryRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await listInventory(req.tenant.id);
    res.json({ items });
  }),
);

const itemInputSchema = z.object({
  name: z.string().min(2, 'Informe o nome do item.'),
  unit: z.string().min(1).max(10).optional(),
  quantity: z.number().int().min(0).optional(),
  minQuantity: z.number().int().min(0).optional(),
  costCents: z.number().int().min(0).nullable().optional(),
});

inventoryRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = itemInputSchema.parse(req.body);
    const item = await createItem(req.tenant.id, input);
    res.status(201).json({ item });
  }),
);

const itemUpdateSchema = itemInputSchema.partial().extend({ active: z.boolean().optional() });

inventoryRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = itemUpdateSchema.parse(req.body);
    const item = await updateItem(req.tenant.id, req.params.id, input);
    res.json({ item });
  }),
);

const adjustSchema = z.object({ delta: z.number().int().refine((v) => v !== 0, 'Informe uma quantidade diferente de zero.') });

inventoryRouter.post(
  '/:id/adjust',
  asyncHandler(async (req, res) => {
    const { delta } = adjustSchema.parse(req.body);
    const item = await adjustQuantity(req.tenant.id, req.params.id, delta);
    res.json({ item });
  }),
);
