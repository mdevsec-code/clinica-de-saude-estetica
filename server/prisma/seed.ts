import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const prisma = new PrismaClient();

// Horário de funcionamento real informado pela clínica:
// terça a sexta, 09h-17h · sábado, 08h-12h · domingo e segunda fechado.
const BUSINESS_HOURS: Array<{ weekday: number; opensAt: string; closesAt: string }> = [
  { weekday: 2, opensAt: '09:00', closesAt: '17:00' }, // terça
  { weekday: 3, opensAt: '09:00', closesAt: '17:00' }, // quarta
  { weekday: 4, opensAt: '09:00', closesAt: '17:00' }, // quinta
  { weekday: 5, opensAt: '09:00', closesAt: '17:00' }, // sexta
  { weekday: 6, opensAt: '08:00', closesAt: '12:00' }, // sábado
];

// Categorias de referência citadas pela própria clínica como as usadas hoje na
// plataforma externa de agendamento. Os SERVIÇOS dentro de cada categoria ainda
// não foram informados (nome exato, duração, preço) — ficam como placeholders
// claramente marcados, editáveis via painel administrativo antes de publicar.
// Harmonização Facial e Corporal é o carro-chefe da clínica (confirmado pela
// própria clínica) — sortOrder 0 e featured:true para ganhar destaque na home.
const CATEGORIES = [
  { name: 'Harmonização Facial e Corporal', slug: 'harmonizacao-facial-corporal', featured: true },
  { name: 'Sobrancelha', slug: 'sobrancelha', featured: false },
  { name: 'Limpeza de Pele', slug: 'limpeza-de-pele', featured: false },
  { name: 'Depilação', slug: 'depilacao', featured: false },
  { name: 'Massagens e Terapias Corporais', slug: 'massagens-terapias-corporais', featured: false },
  { name: 'Micropigmentação', slug: 'micropigmentacao', featured: false },
];

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'noely-cerqueira' },
    update: {},
    create: {
      name: 'Noely Cerqueira — Estética e Micropigmentação',
      slug: 'noely-cerqueira',
      timezone: process.env.TENANT_TIMEZONE ?? 'America/Bahia',
    },
  });

  await prisma.tenantSettings.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      whatsapp: '5571992894874',
      instagram: '@noelycerqueira',
      email: 'noelydesouzacerqueiradossantos@gmail.com',
      address: 'Rua Vênus, 38, Camaçari, Bahia, 42847',
      minAdvanceMinutes: 120,
      slotGranularityMin: 15,
      maxAdvanceDays: 60,
    },
  });

  for (const bh of BUSINESS_HOURS) {
    const existing = await prisma.businessHour.findFirst({
      where: { tenantId: tenant.id, weekday: bh.weekday },
    });
    if (!existing) {
      await prisma.businessHour.create({ data: { tenantId: tenant.id, ...bh } });
    }
  }

  for (const [index, cat] of CATEGORIES.entries()) {
    await prisma.serviceCategory.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: cat.slug } },
      update: { name: cat.name, featured: cat.featured, sortOrder: index },
      create: {
        tenantId: tenant.id,
        name: cat.name,
        slug: cat.slug,
        featured: cat.featured,
        sortOrder: index,
      },
    });
  }

  const adminEmail = process.env.ADMIN_SEED_EMAIL;
  const adminPassword = process.env.ADMIN_SEED_PASSWORD;
  if (!adminEmail || !adminPassword) {
    throw new Error(
      'ADMIN_SEED_EMAIL e ADMIN_SEED_PASSWORD são obrigatórios para rodar o seed (evita criar um admin com credenciais previsíveis).',
    );
  }
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: adminEmail } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Noely Cerqueira',
      email: adminEmail,
      passwordHash,
      role: UserRole.ADMIN,
    },
  });

  console.log('Seed concluído.');
  console.log(`Tenant: ${tenant.slug}`);
  console.log(`Categorias criadas: ${CATEGORIES.length} (sem serviços ainda — cadastre pelo painel).`);
  console.log(`Login admin: ${adminEmail} / senha definida em ADMIN_SEED_PASSWORD`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
