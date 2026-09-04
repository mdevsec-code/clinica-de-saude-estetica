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

// Categorias e serviços extraídos da agenda real da clínica (agendas.link),
// a plataforma que ela já usa — nomes, preços (em centavos) e durações são os
// mesmos cadastrados lá, não placeholders. "Harmonização Facial" e
// "Harmonização Corporal" são categorias SEPARADAS na fonte real (antes
// existiam aqui como uma única "Harmonização Facial e Corporal" — dividida
// pra bater com a estrutura real da clínica). Harmonização Facial continua
// como carro-chefe (featured:true, sortOrder 0), mesma posição de destaque
// que a categoria combinada tinha antes.
const CATEGORIES = [
  { name: 'Harmonização Facial', slug: 'harmonizacao-facial', featured: true, imageUrl: '/services/harmonizacao-facial.jpg' },
  { name: 'Harmonização Corporal', slug: 'harmonizacao-corporal', featured: false, imageUrl: '/services/harmonizacao-corporal.jpg' },
  { name: 'Micropigmentação', slug: 'micropigmentacao', featured: false, imageUrl: '/services/micropigmentacao.jpg' },
  { name: 'Sobrancelha', slug: 'sobrancelha', featured: false, imageUrl: '/services/sobrancelha.jpg' },
  { name: 'Limpeza de Pele', slug: 'limpeza-de-pele', featured: false, imageUrl: '/services/limpeza-de-pele.jpg' },
  { name: 'Depilação', slug: 'depilacao', featured: false, imageUrl: '/services/depilacao.jpg' },
  { name: 'Massagens e Terapias Corporais', slug: 'massagens-terapias-corporais', featured: false, imageUrl: '/services/massagens-terapias-corporais.jpg' },
  // Categoria nova (fora da fonte agendas.link, adicionada a pedido) —
  // ainda sem preço/duração reais cadastrados, então entra como "mediante
  // avaliação" igual aos demais serviços sem valor fechado na fonte real.
  { name: 'Nutrição', slug: 'nutricao', featured: false, imageUrl: '/services/nutricao.jpg' },
];

// priceCents: null = "valor mediante avaliação" na fonte real (não custa
// R$0 — o preço depende de avaliação prévia, não é pra mostrar "R$0,00" no
// site). durationMinutes: alguns serviços da fonte real não têm duração
// cadastrada lá (ex.: procedimentos "mediante avaliação") — 60min é uma
// estimativa razoável nesses casos, marcada abaixo, já que o schema exige
// um valor.
// imageUrl: foto específica do procedimento (não a foto de capa da
// categoria) — sourced uma a uma por serviço; "Avaliação" se repete em
// várias categorias mas é sempre a mesma ação (consulta/anamnese), então
// compartilha uma única foto de consulta em vez de reusar a capa da
// categoria onde ela aparece.
const SERVICES: Array<{
  categorySlug: string;
  name: string;
  slug: string;
  durationMinutes: number;
  priceCents: number | null;
  description?: string;
  imageUrl: string;
  // Módulo de acompanhamento de pacientes: dias após o procedimento em que
  // um retorno deve ser lembrado automaticamente (ver ProcedureRecord no
  // schema). Botox = [15, 122] é o exemplo literal pedido (03/09 → 18/09 e
  // 03/01) — os demais ficam com [] (sem retorno automático) até a clínica
  // decidir o protocolo de cada procedimento; configurável depois pela
  // ficha de serviço no painel, não hardcoded pra sempre.
  returnOffsetDays?: number[];
}> = [
  // --- Depilação (11) ---
  { categorySlug: 'depilacao', name: 'Depilação axila', slug: 'depilacao-axila', durationMinutes: 30, priceCents: 3000, imageUrl: '/services/catalog/dp-axila.jpg' },
  { categorySlug: 'depilacao', name: 'Depilação axila masculina', slug: 'depilacao-axila-masculina', durationMinutes: 30, priceCents: 3500, imageUrl: '/services/catalog/dp-axila-masculina.jpg' },
  { categorySlug: 'depilacao', name: 'Depilação buço', slug: 'depilacao-buco', durationMinutes: 20, priceCents: 1500, imageUrl: '/services/catalog/dp-buco.jpg' },
  { categorySlug: 'depilacao', name: 'Decote total', slug: 'decote-total', durationMinutes: 60, priceCents: 7000, imageUrl: '/services/catalog/dp-decote.jpg' },
  { categorySlug: 'depilacao', name: 'Depilação nariz', slug: 'depilacao-nariz', durationMinutes: 30, priceCents: 1500, imageUrl: '/services/catalog/dp-nariz.jpg' },
  { categorySlug: 'depilacao', name: 'Depilação abdômen', slug: 'depilacao-abdomen', durationMinutes: 30, priceCents: 2300, imageUrl: '/services/catalog/dp-abdomen.jpg' },
  { categorySlug: 'depilacao', name: 'Depilação orelha', slug: 'depilacao-orelha', durationMinutes: 30, priceCents: 1500, imageUrl: '/services/catalog/dp-orelha.jpg' },
  { categorySlug: 'depilacao', name: 'Depilação barriga', slug: 'depilacao-barriga', durationMinutes: 30, priceCents: 3000, description: 'Epilação de barriga completa', imageUrl: '/services/catalog/dp-barriga.jpg' },
  { categorySlug: 'depilacao', name: 'Depilação nádegas', slug: 'depilacao-nadegas', durationMinutes: 30, priceCents: 3500, imageUrl: '/services/catalog/dp-nadegas.jpg' },
  { categorySlug: 'depilacao', name: 'Depilação meia perna', slug: 'depilacao-meia-perna', durationMinutes: 30, priceCents: 3500, imageUrl: '/services/catalog/dp-meia-perna.jpg' },
  { categorySlug: 'depilacao', name: 'Depilação perna inteira', slug: 'depilacao-perna-inteira', durationMinutes: 60, priceCents: 7000, imageUrl: '/services/catalog/dp-perna-inteira.jpg' },

  // --- Sobrancelha (4) ---
  { categorySlug: 'sobrancelha', name: 'Design de sobrancelha com henna', slug: 'design-sobrancelha-henna', durationMinutes: 30, priceCents: 4000, imageUrl: '/services/catalog/sb-henna.jpg' },
  { categorySlug: 'sobrancelha', name: 'Design de sobrancelha simples', slug: 'design-sobrancelha-simples', durationMinutes: 30, priceCents: 3000, imageUrl: '/services/catalog/sb-simples.jpg' },
  { categorySlug: 'sobrancelha', name: 'Design de sobrancelhas (micro)', slug: 'design-sobrancelha-micro', durationMinutes: 30, priceCents: 2500, imageUrl: '/services/catalog/sb-micro.jpg' },
  { categorySlug: 'sobrancelha', name: 'Retoque de micro', slug: 'retoque-de-micro-sobrancelha', durationMinutes: 60, priceCents: 35000, imageUrl: '/services/catalog/sb-retoque.jpg' },

  // --- Limpeza de Pele (4) ---
  { categorySlug: 'limpeza-de-pele', name: 'Limpeza de pele com peeling de diamante', slug: 'limpeza-pele-peeling-diamante', durationMinutes: 90, priceCents: 19500, imageUrl: '/services/catalog/lp-peeling-diamante.jpg' },
  { categorySlug: 'limpeza-de-pele', name: 'Limpeza de pele profunda', slug: 'limpeza-pele-profunda', durationMinutes: 90, priceCents: 16500, imageUrl: '/services/catalog/lp-profunda.jpg' },
  { categorySlug: 'limpeza-de-pele', name: 'Microagulhamento com ácido retinol', slug: 'microagulhamento-acido-retinol', durationMinutes: 60, priceCents: null, description: 'Valor mediante avaliação', imageUrl: '/services/catalog/lp-microagulhamento-retinol.jpg' },
  { categorySlug: 'limpeza-de-pele', name: 'Avaliação', slug: 'avaliacao-limpeza-de-pele', durationMinutes: 30, priceCents: 6000, imageUrl: '/services/catalog/consultation-avaliacao.jpg' },

  // --- Harmonização Facial (14) ---
  { categorySlug: 'harmonizacao-facial', name: 'Preenchimento labial', slug: 'preenchimento-labial', durationMinutes: 60, priceCents: null, description: 'Valor mediante avaliação', imageUrl: '/services/catalog/hf-preenchimento-labial.jpg' },
  { categorySlug: 'harmonizacao-facial', name: 'Preenchimento de olheiras', slug: 'preenchimento-olheiras', durationMinutes: 60, priceCents: null, description: 'Valor mediante avaliação', imageUrl: '/services/catalog/hf-preenchimento-olheiras.jpg' },
  { categorySlug: 'harmonizacao-facial', name: 'Botox', slug: 'botox', durationMinutes: 60, priceCents: null, description: 'Valor mediante avaliação', imageUrl: '/services/catalog/hf-botox.jpg', returnOffsetDays: [15, 122] },
  { categorySlug: 'harmonizacao-facial', name: 'Avaliação', slug: 'avaliacao-harmonizacao-facial', durationMinutes: 30, priceCents: 6000, imageUrl: '/services/catalog/consultation-avaliacao.jpg' },
  { categorySlug: 'harmonizacao-facial', name: 'Preenchimento malar', slug: 'preenchimento-malar', durationMinutes: 60, priceCents: null, description: 'Valor mediante avaliação', imageUrl: '/services/catalog/hf-preenchimento-malar.jpg' },
  { categorySlug: 'harmonizacao-facial', name: 'Preenchimento zigomático', slug: 'preenchimento-zigomatico', durationMinutes: 60, priceCents: null, description: 'Valor mediante avaliação', imageUrl: '/services/catalog/hf-preenchimento-zigomatico.jpg' },
  { categorySlug: 'harmonizacao-facial', name: 'Preenchimento bigode chinês', slug: 'preenchimento-bigode-chines', durationMinutes: 60, priceCents: null, description: 'Valor mediante avaliação', imageUrl: '/services/catalog/hf-preenchimento-bigode-chines.jpg' },
  { categorySlug: 'harmonizacao-facial', name: 'Bioestimulador de colágeno facial', slug: 'bioestimulador-colageno-facial', durationMinutes: 120, priceCents: null, description: 'Valor mediante avaliação', imageUrl: '/services/catalog/hf-bioestimulador.jpg' },
  { categorySlug: 'harmonizacao-facial', name: 'Preenchimento de mento', slug: 'preenchimento-mento', durationMinutes: 60, priceCents: null, description: 'Valor mediante avaliação', imageUrl: '/services/catalog/hf-preenchimento-mento.jpg' },
  { categorySlug: 'harmonizacao-facial', name: 'Fios espiculados', slug: 'fios-espiculados', durationMinutes: 120, priceCents: null, description: 'Valor mediante avaliação', imageUrl: '/services/catalog/hf-fios-espiculados.jpg' },
  { categorySlug: 'harmonizacao-facial', name: 'Lipo de papada', slug: 'lipo-de-papada', durationMinutes: 60, priceCents: null, description: 'Valor mediante avaliação', imageUrl: '/services/catalog/hf-lipo-papada.jpg' },
  { categorySlug: 'harmonizacao-facial', name: 'Peeling químico', slug: 'peeling-quimico', durationMinutes: 60, priceCents: 18000, imageUrl: '/services/catalog/hf-peeling-quimico.jpg' },
  { categorySlug: 'harmonizacao-facial', name: 'Microagulhamento facial', slug: 'microagulhamento-facial', durationMinutes: 60, priceCents: 25000, imageUrl: '/services/catalog/hf-microagulhamento-facial.jpg' },
  { categorySlug: 'harmonizacao-facial', name: 'Microvasos', slug: 'microvasos', durationMinutes: 120, priceCents: null, description: 'Valor mediante avaliação', imageUrl: '/services/catalog/hf-microvasos.jpg' },

  // --- Micropigmentação (8) ---
  { categorySlug: 'micropigmentacao', name: 'Micropigmentação labial', slug: 'micropigmentacao-labial', durationMinutes: 90, priceCents: 45000, imageUrl: '/services/catalog/mp-labial.jpg' },
  { categorySlug: 'micropigmentacao', name: 'Micropigmentação de olhos', slug: 'micropigmentacao-olhos', durationMinutes: 60, priceCents: 35000, imageUrl: '/services/catalog/mp-olhos.jpg' },
  { categorySlug: 'micropigmentacao', name: 'Micropigmentação shadow', slug: 'micropigmentacao-shadow', durationMinutes: 60, priceCents: 45000, imageUrl: '/services/catalog/mp-shadow.jpg' },
  { categorySlug: 'micropigmentacao', name: 'Micropigmentação fio a fio', slug: 'micropigmentacao-fio-a-fio', durationMinutes: 90, priceCents: 35000, imageUrl: '/services/catalog/mp-fio-a-fio.jpg' },
  { categorySlug: 'micropigmentacao', name: 'Avaliação', slug: 'avaliacao-micropigmentacao', durationMinutes: 30, priceCents: 6000, imageUrl: '/services/catalog/consultation-avaliacao.jpg' },
  { categorySlug: 'micropigmentacao', name: 'Neutralização labial', slug: 'neutralizacao-labial', durationMinutes: 60, priceCents: 45000, description: 'Com retorno em 45 dias', imageUrl: '/services/catalog/mp-neutralizacao-labial.jpg' },
  { categorySlug: 'micropigmentacao', name: 'Retorno de micro labial', slug: 'retorno-micro-labial', durationMinutes: 60, priceCents: null, imageUrl: '/services/catalog/mp-retorno-labial.jpg' },
  { categorySlug: 'micropigmentacao', name: 'Retorno de micro de sobrancelha', slug: 'retorno-micro-sobrancelha', durationMinutes: 60, priceCents: null, imageUrl: '/services/catalog/mp-retorno-sobrancelha.jpg' },

  // --- Massagens e Terapias Corporais (5) ---
  { categorySlug: 'massagens-terapias-corporais', name: 'Massagem com ventosa', slug: 'massagem-ventosa', durationMinutes: 40, priceCents: 16000, imageUrl: '/services/catalog/ms-ventosa.jpg' },
  { categorySlug: 'massagens-terapias-corporais', name: 'Massagem relaxante', slug: 'massagem-relaxante', durationMinutes: 60, priceCents: 13500, description: 'Massagem relaxante corpo inteiro', imageUrl: '/services/massagens-terapias-corporais.jpg' },
  { categorySlug: 'massagens-terapias-corporais', name: 'Avaliação', slug: 'avaliacao-massagens-terapias-corporais', durationMinutes: 30, priceCents: 6000, imageUrl: '/services/catalog/consultation-avaliacao.jpg' },
  { categorySlug: 'massagens-terapias-corporais', name: 'Massagem com pedras quentes', slug: 'massagem-pedras-quentes', durationMinutes: 30, priceCents: 15000, description: 'Massagem relaxante com pedras quentes', imageUrl: '/services/catalog/ms-pedras-quentes.jpg' },
  { categorySlug: 'massagens-terapias-corporais', name: 'Massagem terapêutica', slug: 'massagem-terapeutica', durationMinutes: 60, priceCents: 19000, description: 'Massagem terapêutica com ventosa e escalda-pés', imageUrl: '/services/catalog/ms-terapeutica.jpg' },

  // --- Harmonização Corporal (13) ---
  { categorySlug: 'harmonizacao-corporal', name: 'Eletrolipólise', slug: 'eletrolipolise', durationMinutes: 40, priceCents: 10000, imageUrl: '/services/catalog/hc-eletrolipolise.jpg' },
  { categorySlug: 'harmonizacao-corporal', name: 'Manta térmica', slug: 'manta-termica', durationMinutes: 40, priceCents: 12000, imageUrl: '/services/catalog/hc-manta-termica.jpg' },
  { categorySlug: 'harmonizacao-corporal', name: 'Massagem modeladora', slug: 'massagem-modeladora', durationMinutes: 50, priceCents: 12000, imageUrl: '/services/catalog/hc-massagem-modeladora.jpg' },
  { categorySlug: 'harmonizacao-corporal', name: 'Drenagem linfática', slug: 'drenagem-linfatica', durationMinutes: 60, priceCents: 15000, imageUrl: '/services/catalog/hc-drenagem-linfatica.jpg' },
  { categorySlug: 'harmonizacao-corporal', name: 'Drenagem pós enzimas', slug: 'drenagem-pos-enzimas', durationMinutes: 60, priceCents: null, description: 'Valor mediante avaliação', imageUrl: '/services/catalog/hc-drenagem-pos-enzimas.jpg' },
  { categorySlug: 'harmonizacao-corporal', name: 'Radiofrequência', slug: 'radiofrequencia', durationMinutes: 60, priceCents: 12000, imageUrl: '/services/catalog/hc-radiofrequencia.jpg' },
  { categorySlug: 'harmonizacao-corporal', name: 'Protocolo para flacidez', slug: 'protocolo-flacidez', durationMinutes: 60, priceCents: null, description: 'Valor mediante avaliação', imageUrl: '/services/catalog/hc-protocolo-flacidez.jpg' },
  { categorySlug: 'harmonizacao-corporal', name: 'Lipo enzimática', slug: 'lipo-enzimatica', durationMinutes: 30, priceCents: null, description: 'Valor mediante avaliação', imageUrl: '/services/catalog/hc-lipo-enzimatica.jpg' },
  { categorySlug: 'harmonizacao-corporal', name: 'Avaliação', slug: 'avaliacao-harmonizacao-corporal', durationMinutes: 30, priceCents: 6000, imageUrl: '/services/catalog/consultation-avaliacao.jpg' },
  { categorySlug: 'harmonizacao-corporal', name: 'Protocolo para estrias brancas', slug: 'protocolo-estrias-brancas', durationMinutes: 60, priceCents: null, description: 'Microagulhamento para estrias — valor mediante avaliação', imageUrl: '/services/catalog/hc-protocolo-estrias.jpg' },
  { categorySlug: 'harmonizacao-corporal', name: 'Bumbum na nuca', slug: 'bumbum-na-nuca', durationMinutes: 60, priceCents: null, description: 'Valor mediante avaliação', imageUrl: '/services/catalog/hc-bumbum-na-nuca.jpg' },
  { categorySlug: 'harmonizacao-corporal', name: 'Criolipólise', slug: 'criolipolise', durationMinutes: 90, priceCents: null, description: 'Valor mediante avaliação', imageUrl: '/services/catalog/hc-criolipolise.jpg' },
  { categorySlug: 'harmonizacao-corporal', name: 'Microagulhamento corporal', slug: 'microagulhamento-corporal', durationMinutes: 60, priceCents: 25000, imageUrl: '/services/catalog/hc-microagulhamento-corporal.jpg' },

  // --- Nutrição (1) ---
  { categorySlug: 'nutricao', name: 'Consulta nutricional', slug: 'consulta-nutricional', durationMinutes: 60, priceCents: null, description: 'Valor mediante avaliação', imageUrl: '/services/nutricao.jpg' },
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

  const categoryIdBySlug: Record<string, string> = {};
  for (const [index, cat] of CATEGORIES.entries()) {
    const created = await prisma.serviceCategory.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: cat.slug } },
      update: { name: cat.name, featured: cat.featured, imageUrl: cat.imageUrl, sortOrder: index },
      create: {
        tenantId: tenant.id,
        name: cat.name,
        slug: cat.slug,
        featured: cat.featured,
        imageUrl: cat.imageUrl,
        sortOrder: index,
      },
    });
    categoryIdBySlug[cat.slug] = created.id;
  }

  for (const [index, svc] of SERVICES.entries()) {
    const categoryId = categoryIdBySlug[svc.categorySlug];
    await prisma.service.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: svc.slug } },
      update: {
        name: svc.name,
        categoryId,
        durationMinutes: svc.durationMinutes,
        priceCents: svc.priceCents,
        description: svc.description,
        imageUrl: svc.imageUrl,
        returnOffsetDays: svc.returnOffsetDays ?? [],
        sortOrder: index,
      },
      create: {
        tenantId: tenant.id,
        categoryId,
        name: svc.name,
        slug: svc.slug,
        durationMinutes: svc.durationMinutes,
        priceCents: svc.priceCents,
        description: svc.description,
        imageUrl: svc.imageUrl,
        returnOffsetDays: svc.returnOffsetDays ?? [],
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
  console.log(`Categorias: ${CATEGORIES.length}`);
  console.log(`Serviços: ${SERVICES.length}`);
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
