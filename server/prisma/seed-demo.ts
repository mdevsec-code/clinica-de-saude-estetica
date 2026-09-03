import { AppointmentStatus, BankTransactionStatus, ExpenseCategory, ExpenseStatus, PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

// Dados fictícios para popular o painel antes de uma gravação/demonstração —
// script separado do seed.ts principal (esse continua enxuto, só a base real
// da clínica) para nunca arriscar tocar em dado de produção sem querer.
// Idempotente para SERVIÇOS e ESTOQUE (upsert por chave única); clientes,
// agendamentos, despesas, transações bancárias e log de auditoria são
// sempre criados do zero a cada execução — rodar duas vezes duplica esses.

const CUSTOMERS = [
  { name: 'Ana Beatriz Souza', whatsapp: '5571991234501' },
  { name: 'Camila Ferreira Lima', whatsapp: '5571991234502' },
  { name: 'Juliana Alves Costa', whatsapp: '5571991234503' },
  { name: 'Patrícia Nascimento', whatsapp: '5571991234504' },
  { name: 'Fernanda Oliveira Reis', whatsapp: '5571991234505' },
  { name: 'Larissa Santos Cruz', whatsapp: '5571991234506' },
  { name: 'Rafaela Dias Barbosa', whatsapp: '5571991234507' },
  { name: 'Bianca Rodrigues Melo', whatsapp: '5571991234508' },
  { name: 'Vanessa Pereira Rocha', whatsapp: '5571991234509' },
  { name: 'Débora Carvalho Nunes', whatsapp: '5571991234510' },
  { name: 'Aline Gomes Teixeira', whatsapp: '5571991234511' },
  { name: 'Priscila Martins Araújo', whatsapp: '5571991234512' },
  { name: 'Tatiane Ribeiro Correia', whatsapp: '5571991234513' },
  { name: 'Mariana Silva Andrade', whatsapp: '5571991234514' },
  { name: 'Gabriela Fonseca Pinto', whatsapp: '5571991234515' },
  { name: 'Renata Cardoso Vieira', whatsapp: '5571991234516' },
  { name: 'Simone Batista Freitas', whatsapp: '5571991234517' },
  { name: 'Carolina Moreira Duarte', whatsapp: '5571991234518' },
];

const INVENTORY_ITEMS = [
  { name: 'Ácido hialurônico 1ml', unit: 'un', quantity: 12, minQuantity: 5, costCents: 45000 },
  { name: 'Toxina botulínica 100U', unit: 'un', quantity: 3, minQuantity: 4, costCents: 90000 },
  { name: 'Luvas de procedimento (caixa)', unit: 'cx', quantity: 8, minQuantity: 3, costCents: 3500 },
  { name: 'Algodão', unit: 'pct', quantity: 20, minQuantity: 5, costCents: 800 },
  { name: 'Cera de depilação', unit: 'kg', quantity: 2, minQuantity: 3, costCents: 6000 },
  { name: 'Pigmento para micropigmentação', unit: 'un', quantity: 6, minQuantity: 2, costCents: 12000 },
  { name: 'Óleo para massagem', unit: 'un', quantity: 1, minQuantity: 3, costCents: 4000 },
  { name: 'Máscara facial descartável', unit: 'un', quantity: 40, minQuantity: 10, costCents: 500 },
];

const EXPENSES: Array<{
  description: string;
  category: ExpenseCategory;
  amountCents: number;
  status: ExpenseStatus;
  dueOffsetDays?: number;
  paidOffsetDays?: number;
}> = [
  { description: 'Aluguel da clínica — setembro', category: 'ALUGUEL', amountCents: 350000, status: 'PAID', paidOffsetDays: -1 },
  { description: 'Fornecedor — ácido hialurônico', category: 'PRODUTOS', amountCents: 90000, status: 'PAID', paidOffsetDays: -12 },
  { description: 'Manutenção do aparelho de laser', category: 'EQUIPAMENTOS', amountCents: 45000, status: 'PAID', paidOffsetDays: -20 },
  { description: 'Anúncios Instagram/Facebook', category: 'MARKETING', amountCents: 30000, status: 'PAID', paidOffsetDays: 0 },
  { description: 'Salário — recepção', category: 'SALARIOS', amountCents: 180000, status: 'PAID', paidOffsetDays: -1 },
  { description: 'Fornecedor — toxina botulínica', category: 'PRODUTOS', amountCents: 135000, status: 'PENDING', dueOffsetDays: 4 },
  { description: 'Conta de energia', category: 'OUTROS', amountCents: 28000, status: 'PENDING', dueOffsetDays: 2 },
  { description: 'Internet e telefonia', category: 'OUTROS', amountCents: 15000, status: 'PENDING', dueOffsetDays: 7 },
  { description: 'Contador — honorários mensais', category: 'OUTROS', amountCents: 40000, status: 'PENDING', dueOffsetDays: -3 }, // atrasado, de propósito
  { description: 'Reposição de luvas e descartáveis', category: 'PRODUTOS', amountCents: 12000, status: 'PENDING', dueOffsetDays: -1 }, // atrasado, de propósito
];

// America/Bahia é UTC-3 o ano inteiro (sem horário de verão) — soma direta
// de 3h basta pra converter um horário local em instante UTC.
function bahiaDateTime(year: number, monthIndex: number, day: number, hour: number, minute: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, hour + 3, minute));
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

// weekday: 0=domingo ... 6=sábado — mesmo horário real do seed principal.
const OPEN_HOURS: Record<number, { start: number; end: number }> = {
  2: { start: 9, end: 17 },
  3: { start: 9, end: 17 },
  4: { start: 9, end: 17 },
  5: { start: 9, end: 17 },
  6: { start: 8, end: 12 },
};

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'noely-cerqueira' } });
  if (!tenant) {
    throw new Error('Tenant "noely-cerqueira" não encontrado — rode "npm run seed" primeiro.');
  }
  const admin = await prisma.user.findFirst({ where: { tenantId: tenant.id, role: 'ADMIN' } });
  if (!admin) {
    throw new Error('Nenhum usuário ADMIN encontrado — rode "npm run seed" primeiro.');
  }

  // --- Serviços: usa os serviços REAIS já cadastrados por "npm run seed"
  // (extraídos da agenda real da clínica), não mais uma lista fictícia —
  // precisa rodar "npm run seed" antes deste script. ---
  const allServices = await prisma.service.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, durationMinutes: true },
  });
  if (!allServices.length) {
    throw new Error('Nenhum serviço encontrado — rode "npm run seed" primeiro.');
  }
  console.log(`Serviços disponíveis: ${allServices.length}`);

  // --- Clientes ---
  const customers = [];
  for (const c of CUSTOMERS) {
    const customer = await prisma.customer.create({
      data: { tenantId: tenant.id, name: c.name, whatsapp: c.whatsapp },
    });
    customers.push(customer);
  }
  console.log(`Clientes criados: ${customers.length}`);

  // --- Agendamentos: de 45 dias atrás até 14 dias à frente, respeitando o
  // horário de funcionamento, sem sobrepor horários (mesmo raciocínio da
  // EXCLUDE CONSTRAINT real: um atendimento por vez). ---
  const today = new Date();
  const appointmentsData: {
    tenantId: string;
    customerId: string;
    serviceId: string;
    startAt: Date;
    endAt: Date;
    status: AppointmentStatus;
    source: 'PUBLIC_SITE' | 'INTERNAL';
  }[] = [];

  for (let offset = -45; offset <= 14; offset++) {
    const day = new Date(today);
    day.setDate(day.getDate() + offset);
    const weekday = day.getDay();
    const hours = OPEN_HOURS[weekday];
    if (!hours) continue; // domingo/segunda fechado

    const appointmentsToday = randomInt(2, weekday === 6 ? 3 : 5);
    let cursorMinutes = hours.start * 60 + pick([0, 15, 30]);
    const closeMinutes = hours.end * 60;

    for (let i = 0; i < appointmentsToday; i++) {
      const service = pick(allServices);
      const endMinutes = cursorMinutes + service.durationMinutes;
      if (endMinutes > closeMinutes) break;

      const startAt = bahiaDateTime(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(cursorMinutes / 60), cursorMinutes % 60);
      const endAt = new Date(startAt.getTime() + service.durationMinutes * 60000);

      let status: AppointmentStatus;
      if (offset < 0) {
        const roll = Math.random();
        status = roll < 0.72 ? 'COMPLETED' : roll < 0.87 ? 'CANCELLED' : 'NO_SHOW';
      } else {
        status = 'CONFIRMED';
      }

      appointmentsData.push({
        tenantId: tenant.id,
        customerId: pick(customers).id,
        serviceId: service.id,
        startAt,
        endAt,
        status,
        source: Math.random() < 0.6 ? 'PUBLIC_SITE' : 'INTERNAL',
      });

      // Intervalo entre atendimentos (limpeza/preparo da sala): 15-30min.
      cursorMinutes = endMinutes + pick([15, 20, 30]);
    }
  }

  for (const data of appointmentsData) {
    await prisma.appointment.create({ data });
  }
  console.log(`Agendamentos criados: ${appointmentsData.length}`);

  // --- Estoque (upsert por nome) ---
  for (const item of INVENTORY_ITEMS) {
    await prisma.inventoryItem.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: item.name } },
      update: { quantity: item.quantity, minQuantity: item.minQuantity, costCents: item.costCents },
      create: { tenantId: tenant.id, ...item },
    });
  }
  console.log(`Itens de estoque prontos: ${INVENTORY_ITEMS.length}`);

  // --- Despesas ---
  const createdExpenses = [];
  for (const e of EXPENSES) {
    const dueAt = e.dueOffsetDays !== undefined ? new Date(today.getTime() + e.dueOffsetDays * 86400000) : undefined;
    const paidAt = e.paidOffsetDays !== undefined ? new Date(today.getTime() + e.paidOffsetDays * 86400000) : undefined;
    const expense = await prisma.expense.create({
      data: {
        tenantId: tenant.id,
        description: e.description,
        category: e.category,
        amountCents: e.amountCents,
        status: e.status,
        dueAt,
        paidAt,
      },
    });
    createdExpenses.push(expense);
  }
  console.log(`Despesas criadas: ${createdExpenses.length}`);

  // --- Conciliação bancária: algumas transações batem com despesas já
  // pagas (MATCHED), outras ficam soltas (UNMATCHED) pra mostrar a tela de
  // sugestão de correspondência funcionando. ---
  const paidExpenses = createdExpenses.filter((e) => e.status === 'PAID');
  let fit = 1000;
  for (const expense of paidExpenses) {
    await prisma.bankTransaction.create({
      data: {
        tenantId: tenant.id,
        fitId: `DEMO${fit++}`,
        postedAt: expense.paidAt ?? today,
        amountCents: -expense.amountCents,
        description: expense.description.toUpperCase(),
        status: BankTransactionStatus.MATCHED,
        matchedExpenseId: expense.id,
      },
    });
  }
  const unmatchedExtra = [
    { description: 'PIX RECEBIDO - CLIENTE', amountCents: 15000 },
    { description: 'TARIFA BANCARIA MANUTENCAO CONTA', amountCents: -3990 },
    { description: 'PIX ENVIADO - FORNECEDOR DIVERSOS', amountCents: -22000 },
  ];
  for (const tx of unmatchedExtra) {
    await prisma.bankTransaction.create({
      data: {
        tenantId: tenant.id,
        fitId: `DEMO${fit++}`,
        postedAt: new Date(today.getTime() - randomInt(1, 10) * 86400000),
        amountCents: tx.amountCents,
        description: tx.description,
        status: BankTransactionStatus.UNMATCHED,
      },
    });
  }
  console.log(`Transações bancárias criadas: ${paidExpenses.length + unmatchedExtra.length}`);

  // --- Log de auditoria: algumas entradas realistas pra tela não ficar vazia. ---
  const auditEntries: { action: 'CREATE' | 'UPDATE'; entityType: string; entityLabel: string; method: string; path: string }[] = [
    { action: 'CREATE', entityType: 'Service', entityLabel: 'Preenchimento labial', method: 'POST', path: '/catalog/services' },
    { action: 'UPDATE', entityType: 'Expense', entityLabel: 'Fornecedor — toxina botulínica', method: 'PATCH', path: '/finance/expenses' },
    { action: 'CREATE', entityType: 'InventoryItem', entityLabel: 'Máscara facial descartável', method: 'POST', path: '/inventory' },
    { action: 'UPDATE', entityType: 'Appointment', entityLabel: 'Agendamento de Ana Beatriz Souza', method: 'PATCH', path: '/appointments' },
  ];
  for (const entry of auditEntries) {
    await prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        userId: admin.id,
        userName: admin.name,
        action: entry.action,
        entityType: entry.entityType,
        entityLabel: entry.entityLabel,
        method: entry.method,
        path: entry.path,
      },
    });
  }
  console.log(`Registros de auditoria criados: ${auditEntries.length}`);

  console.log('\nDados de demonstração inseridos com sucesso.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
