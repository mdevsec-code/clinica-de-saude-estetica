import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import {
  createCategory,
  createService,
  listCategoriesForAdmin,
  listCategoriesWithServices,
  updateCategory,
  updateService,
} from './catalog.service';

export const catalogRouter = Router();

catalogRouter.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const categories = await listCategoriesWithServices(req.tenant.id);
    res.json({ categories });
  }),
);

// --- Administração: cadastro de categorias/serviços (item pendente da Fase 1
// — antes só era possível popular isso direto no banco). Só ADMIN gerencia
// catálogo/preços; RECEPTION cuida do dia a dia de agendamentos. ---
const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('ADMIN'));

const categoryInputSchema = z.object({
  name: z.string().min(2, 'Informe um nome para a categoria.'),
  // Não exige URL absoluta: a maioria das imagens vem de /public do próprio
  // front (ex.: "/services/sobrancelha.jpg", mesmo padrão já usado pela logo
  // em /brand) — uma URL absoluta funcionaria também, mas exigi-la rejeitaria
  // o caso comum de asset local sem ganhar nada em validação real.
  imageUrl: z.string().min(1).nullable().optional(),
  featured: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const categoryUpdateSchema = categoryInputSchema.partial().extend({
  active: z.boolean().optional(),
});

const serviceInputSchema = z.object({
  name: z.string().min(2, 'Informe um nome para o serviço.'),
  description: z.string().max(1000).nullable().optional(),
  durationMinutes: z.number().int().min(5, 'A duração mínima é 5 minutos.'),
  bufferMinutes: z.number().int().min(0).optional(),
  priceCents: z.number().int().min(0).nullable().optional(),
  // Não exige URL absoluta: a maioria das imagens vem de /public do próprio
  // front (ex.: "/services/sobrancelha.jpg", mesmo padrão já usado pela logo
  // em /brand) — uma URL absoluta funcionaria também, mas exigi-la rejeitaria
  // o caso comum de asset local sem ganhar nada em validação real.
  imageUrl: z.string().min(1).nullable().optional(),
  sortOrder: z.number().int().optional(),
});

const serviceUpdateSchema = serviceInputSchema.partial().extend({
  categoryId: z.string().min(1).optional(),
  active: z.boolean().optional(),
});

adminRouter.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const categories = await listCategoriesForAdmin(req.tenant.id);
    res.json({ categories });
  }),
);

adminRouter.post(
  '/categories',
  asyncHandler(async (req, res) => {
    const input = categoryInputSchema.parse(req.body);
    const category = await createCategory(req.tenant.id, input);
    res.status(201).json({ category });
  }),
);

adminRouter.patch(
  '/categories/:id',
  asyncHandler(async (req, res) => {
    const input = categoryUpdateSchema.parse(req.body);
    const category = await updateCategory(req.tenant.id, req.params.id, input);
    res.json({ category });
  }),
);

adminRouter.post(
  '/categories/:categoryId/services',
  asyncHandler(async (req, res) => {
    const input = serviceInputSchema.parse(req.body);
    const service = await createService(req.tenant.id, req.params.categoryId, input);
    res.status(201).json({ service });
  }),
);

adminRouter.patch(
  '/services/:id',
  asyncHandler(async (req, res) => {
    const input = serviceUpdateSchema.parse(req.body);
    const service = await updateService(req.tenant.id, req.params.id, input);
    res.json({ service });
  }),
);

catalogRouter.use('/admin', adminRouter);
