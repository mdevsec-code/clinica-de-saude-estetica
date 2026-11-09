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

// Caminho do próprio site ("/services/x.jpg") ou endereço https://, sem
// espaço, aspas, parênteses ou sinais de tag. O valor vai parar dentro de
// `background-image: url(...)` (sem aspas) e de <img src> no site PÚBLICO:
// antes qualquer texto era aceito, e um parêntese ou ponto e vírgula
// fechava o url() e injetava CSS na página de quem visita.
const imageUrlSchema = z
  .string()
  .trim()
  .max(500)
  .regex(/^(\/(?!\/)|https:\/\/)[^\s"'()<>\\;]+$/, 'Use um caminho do site (ex.: /services/foto.jpg) ou um endereço https://.')
  .nullable()
  .optional();

const categoryInputSchema = z.object({
  name: z.string().min(2, 'Informe um nome para a categoria.'),
  // Não exige URL absoluta: a maioria das imagens vem de /public do próprio
  // front (ex.: "/services/sobrancelha.jpg", mesmo padrão já usado pela logo
  // em /brand). Ver imageUrlSchema para o formato aceito.
  imageUrl: imageUrlSchema,
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
  // em /brand). Ver imageUrlSchema para o formato aceito.
  imageUrl: imageUrlSchema,
  sortOrder: z.number().int().optional(),
  // Módulo de acompanhamento de pacientes: dias após o procedimento em que
  // cada retorno deve ser lembrado (ex.: [15, 122] para Botox). Vazio =
  // nenhum retorno automático.
  returnOffsetDays: z.array(z.number().int().min(1).max(3650)).max(10).optional(),
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
