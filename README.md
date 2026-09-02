# 💆‍♀️ Noely Cerqueira — Estética e Micropigmentação

<p>
  <img src="https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white" alt="Node.js 20+" />
  <img src="https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vue-3.4-4FC08D?logo=vue.js&logoColor=white" alt="Vue 3" />
  <img src="https://img.shields.io/badge/Express-4.19-000000?logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/Prisma-6.19-2D3748?logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL 16" />
  <img src="https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/status-em%20desenvolvimento-yellow" alt="Status: em desenvolvimento" />
</p>

Plataforma de gestão e site público da clínica de estética e micropigmentação
da Noely Cerqueira (Camaçari, BA) — construída desde o início como a base de
um **futuro SaaS multi-tenant** para clínicas de estética, com a Noely
Cerqueira como primeiro tenant real.

O projeto é dividido em duas aplicações independentes que conversam por API:
um **site público** com agendamento online self-service, e um **painel
administrativo** completo para a equipe da clínica gerenciar catálogo,
agenda, financeiro, estoque e usuários.

---

## 📑 Sumário

- [Estrutura do repositório](#-estrutura-do-repositório)
- [Stack tecnológica](#-stack-tecnológica)
- [Funcionalidades](#-funcionalidades)
- [Modelo de dados](#-modelo-de-dados)
- [Segurança](#-segurança)
- [Como rodar localmente](#-como-rodar-localmente)
- [Variáveis de ambiente](#-variáveis-de-ambiente)
- [Scripts disponíveis](#-scripts-disponíveis)
- [Roadmap](#-roadmap)

---

## 📂 Estrutura do repositório

```text
clinica-de-saude-estetica/
├── server/     API — Node.js + TypeScript + Express + Prisma + PostgreSQL
├── web/        Site público + agendamento — Vue 3 + TypeScript + Vite + Pinia + GSAP
└── legacy/     Projeto anterior, mantido apenas como referência histórica
               (não é usado pela aplicação atual)
```

<details>
<summary><strong>Ver árvore detalhada de <code>server/src</code> e <code>web/src</code></strong></summary>

```text
server/src/
├── app.ts                      # bootstrap do Express (middlewares, rotas)
├── config/env.ts                # validação de env vars com zod
├── lib/prisma.ts                # client Prisma singleton
├── middleware/
│   ├── audit.middleware.ts      # captura mutações da API e grava log de auditoria
│   ├── error-handler.ts         # tradução de erros em respostas HTTP consistentes
│   ├── rate-limit.ts            # rate limiting (login e agendamento público)
│   └── tenant.middleware.ts     # resolução de tenant — ponto único de isolamento
├── modules/
│   ├── auth/                    # login, sessão, gestão de usuários (ADMIN)
│   ├── appointments/             # agendamentos (público + admin)
│   ├── audit/                    # histórico de ações administrativas — somente ADMIN
│   ├── availability/             # motor de disponibilidade de horários
│   ├── catalog/                  # categorias e serviços (público + admin)
│   ├── customers/                # clientes
│   ├── dashboard/                # métricas agregadas do painel
│   ├── finance/                  # despesas, DRE e conciliação bancária (OFX)
│   ├── inventory/                # estoque
│   └── settings/                 # configurações públicas do tenant
└── utils/                       # async-handler, erros tipados, slugify

web/src/
├── views/                       # Home, Serviços, Agendar, Contato, 404
├── views/admin/                  # Login, Dashboard, Catálogo, Agenda,
│                                  # Financeiro, Estoque, Usuários, Auditoria
├── components/                   # componentes de UI do site público
├── components/admin/              # gráficos, calendário, modais, seletor,
│                                  # conciliação bancária e paleta de comandos (Ctrl+K)
├── composables/                   # animações GSAP (reveal, parallax, tilt…)
├── services/                      # camada única de comunicação com a API
├── stores/                        # Pinia — auth, booking, settings
└── router/                        # rotas + guard de autenticação/role
```

</details>

## 🧱 Stack tecnológica

| Camada | Tecnologias |
|---|---|
| **Backend** | Node.js · TypeScript · Express · Prisma ORM · PostgreSQL 16 · Zod · JWT · bcryptjs · Helmet · Pino |
| **Frontend** | Vue 3 (Composition API) · TypeScript · Vite · Pinia · Vue Router · GSAP (ScrollTrigger, SplitText, Flip) |
| **Infra local** | Docker Compose (PostgreSQL) |

## ✨ Funcionalidades

### Site público (`web/`)

- **Home** com apresentação da clínica e categoria em destaque (Harmonização Facial e Corporal).
- **Serviços** — categorias expansíveis por accordion, com ícones e imagens próprias.
- **Agendamento** self-service em fluxo guiado: serviço → data → horário → dados do cliente → confirmação, consultando disponibilidade real do backend.
- **Contato** com WhatsApp, Instagram, endereço e horário de funcionamento — dados vindos da API, nunca fixos no código.
- Identidade visual autoral: micro-interações e animações com GSAP (scroll reveal, parallax, magnetic buttons, split-text).

### Painel administrativo (`web/src/views/admin/`)

Acesso restrito por login (JWT) em `/admin/login`, com guard de rota que também
respeita papel do usuário (`ADMIN` vs `RECEPTION`). Navegação rápida por busca
com **Ctrl/Cmd+K** (paleta de comandos) além dos atalhos de menu.

| Rota | Tela | Descrição |
|---|---|---|
| `/admin` | Dashboard | Métricas agregadas (agendamentos, receita, ocupação) |
| `/admin/servicos` | Catálogo | CRUD de categorias e serviços, com banners e destaque de "mais agendado" |
| `/admin/agenda` | Agenda | Visão de calendário dos agendamentos, criação manual |
| `/admin/financeiro` | Financeiro | Despesas por status (pendente/pago/atrasado), vencimentos e recebimentos do dia, histórico de faturamento diário, DRE e conciliação bancária via importação de extrato OFX |
| `/admin/estoque` | Estoque | Itens, quantidade mínima, ajuste de saldo |
| `/admin/usuarios` | Usuários | Gestão de contas da equipe — **somente ADMIN** |
| `/admin/auditoria` | Auditoria | Histórico de tudo que a equipe criou/alterou/excluiu no painel — **somente ADMIN** |

### API (`server/`)

- Motor de **disponibilidade real** (horário de funcionamento + agendamentos existentes + bloqueios pontuais), com granularidade e antecedência mínima configuráveis por tenant.
- **Prevenção de double-booking em duas camadas**: transação `SERIALIZABLE` com checagem de overlap na aplicação, **e** uma `EXCLUDE CONSTRAINT` no PostgreSQL (`server/prisma/manual-sql/001_appointment_no_overlap.sql`) como garantia final a nível de banco, mesmo sob concorrência.
- Autenticação por JWT com verificação de tenant no token.
- Rate limiting dedicado para login (força bruta) e criação pública de agendamentos (spam/abuso).
- **Auditoria**: toda mutação feita por um usuário administrativo (criar, alterar, excluir) é registrada com autor, ação, tipo de registro e diff dos dados alterados, consultável e filtrável em `/admin/auditoria`.
- **Financeiro completo**: despesas com vencimento e status, vencimentos/recebimentos do dia, histórico de faturamento diário, DRE (receitas − despesas por período) e conciliação bancária a partir de extratos OFX (parser próprio, sem dependência externa), com sugestão automática de correspondência entre lançamento e transação bancária.

## 🗃️ Modelo de dados

Schema Prisma multi-tenant-ready — toda tabela relevante carrega `tenantId`:

```
Tenant ──┬── User (ADMIN | RECEPTION)
         ├── TenantSettings (contato, regras de agendamento)
         ├── Customer
         ├── ServiceCategory ── Service
         ├── BusinessHour (horário recorrente por dia da semana)
         ├── BlockedTime (folgas, feriados, eventos externos)
         ├── Appointment (CONFIRMED | CANCELLED | COMPLETED | NO_SHOW)
         ├── Expense (PENDING | PAID | OVERDUE — vencimento, pagamento, categoria)
         ├── BankTransaction (extrato OFX importado, conciliado com Expense)
         ├── InventoryItem (controle de estoque)
         └── AuditLog (histórico de ações administrativas)
```

Migrations em `server/prisma/migrations/`. A constraint anti-overlap vive fora
do fluxo padrão de migration do Prisma (que não suporta `EXCLUDE CONSTRAINT`
nativamente) em `server/prisma/manual-sql/001_appointment_no_overlap.sql`.

## 🔒 Segurança

- Nenhum segredo fica no código-fonte — tudo vem de variáveis de ambiente (`.env`, nunca commitado). `JWT_SECRET` é gerado aleatoriamente (mín. 32 caracteres), nunca deixado com valor de exemplo.
- O `npm run seed` recusa rodar sem `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD` explícitos no `.env` — não existe fallback para credenciais previsíveis de admin.
- Toda consulta ao banco passa por resolução explícita de tenant (`server/src/middleware/tenant.middleware.ts`), evitando vazamento de dados entre clínicas quando o sistema virar multi-tenant de fato.
- `requireAuth` confere que o tenant do token JWT bate com o tenant resolvido na requisição — impede usar um login de um tenant para agir sobre dados de outro, mesmo que só exista um tenant em produção hoje.
- Senhas de usuário são armazenadas com hash (`bcrypt`), nunca em texto puro.
- Rate limiting no login (força bruta) e na criação pública de agendamentos (spam/abuso) — `server/src/middleware/rate-limit.ts`.
- Respostas da API são minimizadas: o endpoint público de agendamento nunca devolve ids internos de tenant/cliente, só o necessário para a tela de confirmação (minimização de dados, item de LGPD do escopo).
- Erros técnicos nunca são expostos ao cliente final — apenas mensagens compreensíveis; detalhes completos vão para o log do servidor.
- Toda validação de entrada é feita no backend (`zod`), independentemente do que o frontend valida.
- Cabeçalhos de segurança via `helmet` (CSP, HSTS, X-Frame-Options, etc.) e CORS restrito à origem do frontend.

## 🚀 Como rodar localmente

### Pré-requisitos

- **Node.js 20+**
- **PostgreSQL 16+** rodando localmente, ou via `docker compose up -d` dentro de `server/` (requer Docker Desktop)

### 1. Backend (`server/`)

```bash
cd server
cp .env.example .env   # ajuste DATABASE_URL, JWT_SECRET e ADMIN_SEED_PASSWORD
npm install

# aplica as migrations
npx prisma migrate dev --name init

# aplica a EXCLUDE CONSTRAINT anti-double-booking (fora do fluxo padrão do Prisma)
npx prisma db execute --file prisma/manual-sql/001_appointment_no_overlap.sql --schema prisma/schema.prisma

# popula tenant, categorias, horário de funcionamento e usuário admin inicial
npm run seed

npm run dev
```

A API sobe em **http://localhost:3333**.

### 2. Frontend (`web/`)

```bash
cd web
cp .env.example .env   # ajuste VITE_API_URL se a API não estiver em localhost:3333
npm install
npm run dev
```

O site sobe em **http://localhost:5173** — e o painel administrativo em
**http://localhost:5173/admin/login**, com o e-mail e senha definidos em
`ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` no `.env` do backend.

> ⚠️ **Windows on ARM (ARM64):** o engine nativo do Prisma não tem build para
> `windows-arm64` nas versões usadas aqui — ele roda via emulação x64. Se o
> `npx prisma` falhar com *"is not a valid Win32 application"*, rode o
> Node em modo x64 (ex.: um Node x64 portátil) para os comandos do backend.

## ⚙️ Variáveis de ambiente

### `server/.env`

| Variável | Obrigatória | Descrição |
|---|:---:|---|
| `DATABASE_URL` | ✅ | String de conexão do PostgreSQL |
| `PORT` | — | Porta da API (padrão `3333`) |
| `JWT_SECRET` | ✅ | Segredo para assinatura dos tokens (mín. 32 caracteres) |
| `JWT_EXPIRES_IN` | — | Validade do token (padrão `8h`) |
| `WEB_ORIGIN` | — | Origem permitida no CORS (padrão `http://localhost:5173`) |
| `ADMIN_SEED_EMAIL` | ✅* | E-mail do admin criado pelo `npm run seed` (\*só obrigatório para rodar o seed) |
| `ADMIN_SEED_PASSWORD` | ✅* | Senha do admin criado pelo `npm run seed` (\*só obrigatório para rodar o seed) |
| `TENANT_TIMEZONE` | — | Fuso horário do tenant (padrão `America/Bahia`) |

### `web/.env`

| Variável | Obrigatória | Descrição |
|---|:---:|---|
| `VITE_API_URL` | — | URL base da API (padrão `http://localhost:3333`) |

## 📜 Scripts disponíveis

**`server/`**

| Script | Descrição |
|---|---|
| `npm run dev` | API em modo desenvolvimento (`ts-node-dev`, hot reload) |
| `npm run build` | Compila TypeScript para `dist/` |
| `npm start` | Roda a versão compilada (produção) |
| `npm run seed` | Popula o banco com tenant, categorias, horários e admin |
| `npm run prisma:studio` | Abre o Prisma Studio (explorador visual do banco) |
| `npm run prisma:migrate` | Cria/aplica uma nova migration |

**`web/`**

| Script | Descrição |
|---|---|
| `npm run dev` | Servidor de desenvolvimento Vite (hot reload) |
| `npm run build` | Type-check (`vue-tsc`) + build de produção |
| `npm run preview` | Serve o build de produção localmente |
| `npm run type-check` | Só o type-check, sem build |

## 🗺️ Roadmap

Fora de escopo desta fase, planejado para depois:

- [ ] Integração com Google Calendar (sincronização de bloqueios)
- [ ] Integração com Meta WhatsApp Cloud API (hoje o contato público é só via link `wa.me`)
- [ ] Cadastro completo dos serviços de cada categoria (nome exato, duração, preço — as categorias já existem, faltam os serviços)
- [ ] Multi-tenant real (hoje a resolução de tenant já existe e é usada em toda query, mas só há um tenant em produção)

---

<p align="center">
  <sub>Noely Cerqueira — Estética e Micropigmentação · Camaçari, BA</sub>
</p>
