import { prisma } from '../../lib/prisma';
import { slugify } from '../../utils/slugify';
import { NotFoundError } from '../../utils/errors';

export async function listCategoriesWithServices(tenantId: string) {
  const categories = await prisma.serviceCategory.findMany({
    where: { tenantId, active: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      services: {
        where: { active: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    imageUrl: category.imageUrl,
    featured: category.featured,
    services: category.services.map(serializeService),
  }));
}

export async function getServiceById(tenantId: string, serviceId: string) {
  return prisma.service.findFirst({
    where: { id: serviceId, tenantId, active: true },
    include: { category: true },
  });
}

function serializeService(service: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number | null;
  imageUrl: string | null;
}) {
  return {
    id: service.id,
    name: service.name,
    slug: service.slug,
    description: service.description,
    durationMinutes: service.durationMinutes,
    price: service.priceCents != null ? service.priceCents / 100 : null,
  };
}

// --- Administração (autenticada — ver catalog.routes.ts) ---
// Serializações "admin" expõem também o que a área pública nunca precisa
// (registros inativos, priceCents cru para não perder precisão em
// arredondamento de edição, bufferMinutes, sortOrder) — por isso são
// funções separadas em vez de reaproveitar listCategoriesWithServices/
// serializeService, que filtram e simplificam de propósito para o público.
function serializeServiceAdmin(service: {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string | null;
  durationMinutes: number;
  bufferMinutes: number;
  priceCents: number | null;
  imageUrl: string | null;
  active: boolean;
  sortOrder: number;
}) {
  return {
    id: service.id,
    categoryId: service.categoryId,
    name: service.name,
    slug: service.slug,
    description: service.description,
    durationMinutes: service.durationMinutes,
    bufferMinutes: service.bufferMinutes,
    priceCents: service.priceCents,
    imageUrl: service.imageUrl,
    active: service.active,
    sortOrder: service.sortOrder,
  };
}

export async function listCategoriesForAdmin(tenantId: string) {
  const categories = await prisma.serviceCategory.findMany({
    where: { tenantId },
    orderBy: { sortOrder: 'asc' },
    include: { services: { orderBy: { sortOrder: 'asc' } } },
  });

  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    imageUrl: category.imageUrl,
    active: category.active,
    featured: category.featured,
    sortOrder: category.sortOrder,
    services: category.services.map(serializeServiceAdmin),
  }));
}

// Gera um slug único por tenant a partir do nome, tentando "nome-2",
// "nome-3"... em caso de colisão — evita expor esse detalhe técnico no
// formulário de cadastro (a clínica digita só o nome do serviço/categoria).
async function uniqueSlug(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base) || 'item';
  let candidate = root;
  let suffix = 2;
  while (await exists(candidate)) {
    candidate = `${root}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

interface CategoryInput {
  name: string;
  imageUrl?: string | null;
  featured?: boolean;
  sortOrder?: number;
  active?: boolean;
}

export async function createCategory(tenantId: string, input: CategoryInput) {
  const slug = await uniqueSlug(
    input.name,
    async (candidate) => (await prisma.serviceCategory.count({ where: { tenantId, slug: candidate } })) > 0,
  );

  return prisma.serviceCategory.create({
    data: {
      tenantId,
      name: input.name,
      slug,
      imageUrl: input.imageUrl ?? null,
      featured: input.featured ?? false,
      sortOrder: input.sortOrder ?? 0,
    },
  });
}

export async function updateCategory(tenantId: string, id: string, input: Partial<CategoryInput>) {
  const category = await prisma.serviceCategory.findFirst({ where: { id, tenantId } });
  if (!category) throw new NotFoundError('Categoria não encontrada.');

  // O slug nunca é alterado aqui de propósito, mesmo que o nome mude: ele
  // pode já estar em links/favoritos, e nada no site hoje precisa que o slug
  // acompanhe o nome (a navegação usa o id).
  return prisma.serviceCategory.update({
    where: { id },
    data: {
      name: input.name ?? undefined,
      imageUrl: input.imageUrl === undefined ? undefined : input.imageUrl,
      featured: input.featured ?? undefined,
      sortOrder: input.sortOrder ?? undefined,
      active: input.active ?? undefined,
    },
  });
}

interface ServiceInput {
  name: string;
  description?: string | null;
  durationMinutes: number;
  bufferMinutes?: number;
  priceCents?: number | null;
  imageUrl?: string | null;
  sortOrder?: number;
  active?: boolean;
}

export async function createService(tenantId: string, categoryId: string, input: ServiceInput) {
  const category = await prisma.serviceCategory.findFirst({ where: { id: categoryId, tenantId } });
  if (!category) throw new NotFoundError('Categoria não encontrada.');

  const slug = await uniqueSlug(
    input.name,
    async (candidate) => (await prisma.service.count({ where: { tenantId, slug: candidate } })) > 0,
  );

  return prisma.service.create({
    data: {
      tenantId,
      categoryId,
      name: input.name,
      slug,
      description: input.description ?? null,
      durationMinutes: input.durationMinutes,
      bufferMinutes: input.bufferMinutes ?? 0,
      priceCents: input.priceCents ?? null,
      imageUrl: input.imageUrl ?? null,
      sortOrder: input.sortOrder ?? 0,
    },
  });
}

export async function updateService(tenantId: string, id: string, input: Partial<ServiceInput> & { categoryId?: string }) {
  const service = await prisma.service.findFirst({ where: { id, tenantId } });
  if (!service) throw new NotFoundError('Serviço não encontrado.');

  if (input.categoryId) {
    const category = await prisma.serviceCategory.findFirst({ where: { id: input.categoryId, tenantId } });
    if (!category) throw new NotFoundError('Categoria não encontrada.');
  }

  return prisma.service.update({
    where: { id },
    data: {
      categoryId: input.categoryId ?? undefined,
      name: input.name ?? undefined,
      description: input.description === undefined ? undefined : input.description,
      durationMinutes: input.durationMinutes ?? undefined,
      bufferMinutes: input.bufferMinutes ?? undefined,
      priceCents: input.priceCents === undefined ? undefined : input.priceCents,
      imageUrl: input.imageUrl === undefined ? undefined : input.imageUrl,
      sortOrder: input.sortOrder ?? undefined,
      active: input.active ?? undefined,
    },
  });
}
