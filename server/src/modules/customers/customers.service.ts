import type { Prisma, PrismaClient } from '@prisma/client';

type TxClient = PrismaClient | Prisma.TransactionClient;

// Identifica o cliente pelo WhatsApp dentro do tenant: se já agendou antes,
// reaproveita o cadastro; senão cria um novo. Evita duplicar clientes a cada
// agendamento (item 44 do escopo — CRM básico).
export async function findOrCreateCustomer(
  tx: TxClient,
  tenantId: string,
  data: { name: string; whatsapp: string; email?: string },
) {
  const existing = await tx.customer.findFirst({
    where: { tenantId, whatsapp: data.whatsapp },
  });

  if (existing) {
    if (existing.name !== data.name || (data.email && existing.email !== data.email)) {
      return tx.customer.update({
        where: { id: existing.id },
        data: { name: data.name, email: data.email ?? existing.email },
      });
    }
    return existing;
  }

  return tx.customer.create({
    data: { tenantId, name: data.name, whatsapp: data.whatsapp, email: data.email },
  });
}
