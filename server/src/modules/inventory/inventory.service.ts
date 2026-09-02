import { prisma } from '../../lib/prisma';
import { AppError, ConflictError, NotFoundError } from '../../utils/errors';

export async function listInventory(tenantId: string) {
  return prisma.inventoryItem.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
  });
}

interface ItemInput {
  name: string;
  unit?: string;
  quantity?: number;
  minQuantity?: number;
  costCents?: number | null;
}

export async function createItem(tenantId: string, input: ItemInput) {
  const existing = await prisma.inventoryItem.findUnique({
    where: { tenantId_name: { tenantId, name: input.name } },
  });
  if (existing) {
    throw new ConflictError('Já existe um item de estoque com este nome.');
  }

  return prisma.inventoryItem.create({
    data: {
      tenantId,
      name: input.name,
      unit: input.unit ?? 'un',
      quantity: input.quantity ?? 0,
      minQuantity: input.minQuantity ?? 0,
      costCents: input.costCents ?? null,
    },
  });
}

export async function updateItem(tenantId: string, id: string, input: Partial<ItemInput> & { active?: boolean }) {
  const item = await prisma.inventoryItem.findFirst({ where: { id, tenantId } });
  if (!item) throw new NotFoundError('Item não encontrado.');

  return prisma.inventoryItem.update({
    where: { id },
    data: {
      name: input.name ?? undefined,
      unit: input.unit ?? undefined,
      minQuantity: input.minQuantity ?? undefined,
      costCents: input.costCents === undefined ? undefined : input.costCents,
      active: input.active ?? undefined,
    },
  });
}

// Ajuste relativo (delta positivo = entrada, negativo = saída) em vez de um
// PATCH direto de quantity: é a forma natural de registrar "chegaram 10
// unidades" ou "usei 2 no atendimento de hoje" sem a pessoa precisar saber
// (ou arriscar sobrescrever) o total atual.
export async function adjustQuantity(tenantId: string, id: string, delta: number) {
  const item = await prisma.inventoryItem.findFirst({ where: { id, tenantId } });
  if (!item) throw new NotFoundError('Item não encontrado.');

  // updateMany com a checagem de estoque no próprio WHERE (em vez de
  // ler quantity e escrever em dois passos) torna o ajuste atômico no
  // banco: duas requisições concorrentes não podem mais ler o mesmo
  // valor inicial e ambas passarem na validação de "não negativo".
  const result = await prisma.inventoryItem.updateMany({
    where: { id, tenantId, quantity: { gte: -delta } },
    data: { quantity: { increment: delta } },
  });

  if (result.count === 0) {
    throw new AppError('Estoque não pode ficar negativo.', 422, 'NEGATIVE_STOCK');
  }

  return prisma.inventoryItem.findFirst({ where: { id, tenantId } });
}
