import type { Prisma, PrismaClient } from '@prisma/client';
import { phoneKey } from '../whatsapp/whatsapp-connection';

type TxClient = PrismaClient | Prisma.TransactionClient;

// Identifica o cliente pelo WhatsApp dentro do tenant: se já agendou antes,
// reaproveita o cadastro; senão cria um novo. Evita duplicar clientes a cada
// agendamento (item 44 do escopo — CRM básico).
//
// Cadastro existente NUNCA é alterado por aqui: esta função atende o
// agendamento público, sem login, e o WhatsApp digitado não prova que quem
// agenda é o dono do número. Antes ela sobrescrevia nome e e-mail com o que
// viesse do formulário — qualquer visitante podia trocar os dados da ficha
// de um paciente real (inclusive o e-mail de contato) só informando o
// número dele. Correções de cadastro são feitas pela equipe, no painel.
// Mesmo celular escrito de outro jeito (com/sem 55, com/sem o 9º dígito,
// com máscara) é a mesma paciente: compara pela chave DDD + 8 últimos
// dígitos. O banco também pode garantir isso (índice único em "phoneKey", ver
// prisma/manual-sql/002_customer_unique_phone.sql).
export async function findCustomerByPhone(tx: TxClient, tenantId: string, whatsapp: string, exceptId?: string) {
  const key = phoneKey(whatsapp);
  const candidates = await tx.customer.findMany({
    where: { tenantId, whatsapp: { endsWith: key.slice(-8) }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    orderBy: { createdAt: 'asc' },
  });
  return candidates.find((c) => phoneKey(c.whatsapp) === key) ?? null;
}

export async function findOrCreateCustomer(
  tx: TxClient,
  tenantId: string,
  data: { name: string; whatsapp: string; email?: string },
) {
  const existing = await findCustomerByPhone(tx, tenantId, data.whatsapp);

  if (existing) {
    return { customer: existing, created: false };
  }

  // `created` informa a quem chama se o cadastro acabou de nascer.
  const customer = await tx.customer.create({
    data: { tenantId, name: data.name, whatsapp: data.whatsapp, email: data.email },
  });
  return { customer, created: true };
}
