import type { Prisma, PrismaClient } from '@prisma/client';

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
export async function findOrCreateCustomer(
  tx: TxClient,
  tenantId: string,
  data: { name: string; whatsapp: string; email?: string },
) {
  const existing = await tx.customer.findFirst({
    where: { tenantId, whatsapp: data.whatsapp },
  });

  if (existing) {
    return { customer: existing, created: false };
  }

  // `created` informa a quem chama se o cadastro acabou de nascer.
  const customer = await tx.customer.create({
    data: { tenantId, name: data.name, whatsapp: data.whatsapp, email: data.email },
  });
  return { customer, created: true };
}
