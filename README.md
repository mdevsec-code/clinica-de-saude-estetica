# Noely Cerqueira — Estética e Micropigmentação

Plataforma de gestão e site público da clínica, construída como a base de um
futuro SaaS multi-tenant para clínicas de estética. A Noely Cerqueira é o
primeiro tenant.

## Estrutura do repositório

```
server/   API (Node.js + TypeScript + Express + Prisma + PostgreSQL)
web/      Site público + agendamento (Vue 3 + TypeScript + Vite + Pinia + GSAP)
legacy/   Projeto anterior (template genérico "Clínica Vida+"), mantido apenas
          como referência histórica — não usado pela aplicação atual.
```

## Estado atual (Fase 1)

Implementado:
- Modelo de dados multi-tenant-ready (Tenant, User/RBAC básico, Customer,
  ServiceCategory, Service, BusinessHour, BlockedTime, Appointment, TenantSettings).
- Motor de disponibilidade real no backend (horário de funcionamento + agendamentos
  existentes + bloqueios), com granularidade e antecedência mínima configuráveis.
- Prevenção de double-booking em duas camadas: transação `SERIALIZABLE` com
  checagem de overlap na aplicação, e uma `EXCLUDE CONSTRAINT` no PostgreSQL
  (`server/prisma/manual-sql/001_appointment_no_overlap.sql`) como garantia final.
- Autenticação por JWT (usada pelo futuro painel administrativo).
- Site público mobile-first: Home, Serviços (categorias expansíveis), fluxo de
  Agendamento (serviço → data → horário → dados → confirmação) e Contato.
- Dados reais da clínica (WhatsApp, Instagram, endereço, horário de funcionamento).

Ainda não implementado (fases futuras, propositalmente fora do escopo desta fase):
- Painel administrativo (dashboard, agenda interna, financeiro, estoque, usuários).
- Integração com Google Calendar.
- Integração com Meta WhatsApp Cloud API (hoje o contato é só por link `wa.me`).
- Cadastro real dos serviços de cada categoria (nome exato, duração, preço) —
  as categorias já existem no banco, mas sem serviços cadastrados ainda.

## Pré-requisitos

- Node.js 20+
- PostgreSQL 16+ rodando localmente (ou via `docker compose up -d` dentro de `server/`,
  se você tiver Docker Desktop com WSL2 habilitado)

## Configuração local

### Backend (`server/`)

```bash
cd server
cp .env.example .env   # ajuste DATABASE_URL, JWT_SECRET e ADMIN_SEED_PASSWORD
npm install
npx prisma migrate dev --name init
npx prisma db execute --file prisma/manual-sql/001_appointment_no_overlap.sql --schema prisma/schema.prisma
npm run seed
npm run dev
```

A API sobe em `http://localhost:3333`.

### Frontend (`web/`)

```bash
cd web
cp .env.example .env   # ajuste VITE_API_URL se a API não estiver em localhost:3333
npm install
npm run dev
```

O site sobe em `http://localhost:5173`.

## Segurança

- Nenhum segredo fica no código-fonte — tudo vem de variáveis de ambiente (`.env`,
  nunca commitado). `JWT_SECRET` é gerado aleatoriamente, nunca deixado com valor
  de exemplo.
- Toda consulta ao banco passa por resolução explícita de tenant
  (`server/src/middleware/tenant.middleware.ts`), evitando vazamento de dados
  entre clínicas quando o sistema virar multi-tenant de fato.
- `requireAuth` confere que o tenant do token JWT bate com o tenant resolvido
  na requisição — impede usar um login de um tenant para agir sobre dados de
  outro, mesmo que só exista um tenant em produção hoje.
- Senhas de usuário são armazenadas com hash (`bcrypt`), nunca em texto puro.
- Rate limiting no login (força bruta) e na criação pública de agendamentos
  (spam/abuso) — `server/src/middleware/rate-limit.ts`.
- Respostas da API são minimizadas: o endpoint público de agendamento nunca
  devolve ids internos de tenant/cliente, só o necessário para a tela de
  confirmação (minimização de dados, item de LGPD do escopo).
- Erros técnicos nunca são expostos ao cliente final — apenas mensagens
  compreensíveis; detalhes completos vão para o log do servidor.
- Toda validação de entrada é feita no backend (`zod`), independentemente do
  que o frontend valida.
