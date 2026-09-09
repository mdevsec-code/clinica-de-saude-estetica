# Guia de deploy em produção

Stack recomendada (custo-benefício para o tamanho atual, com espaço para
crescer conforme o volume de pacientes aumenta):

| Peça | Serviço | Por quê |
|---|---|---|
| API (`server/`) | [Railway](https://railway.app) | Deploy via git, HTTPS automático, sem DevOps |
| Site (`web/`) | [Cloudflare Pages](https://pages.cloudflare.com) | CDN global, grátis, desacoplado do custo da API |
| Banco de dados | [Neon](https://neon.tech) | Postgres serverless, separa storage de computação, branching para testar migrations com segurança |
| Fotos de paciente e fichas digitalizadas | [Cloudflare R2](https://developers.cloudflare.com/r2/) | Compatível com S3, sem taxa de saída — resolve o problema do disco local, que é apagado a cada deploy no Railway |

Custo estimado para começar: ~R$30–65/mês, crescendo só conforme o uso real
(nenhum desses serviços cobra por capacidade não usada nos planos iniciais).

O código já está preparado para essa stack (ver "O que já está pronto"
abaixo) — falta só criar as contas, os recursos, e configurar as variáveis
de ambiente descritas aqui.

> ⚠️ **Repositório privado**: ao conectar o Railway e o Cloudflare Pages ao
> GitHub (seções 3 e 5), a tela de autorização do GitHub vai pedir acesso
> explícito a este repositório especificamente (repos privados não aparecem
> por padrão) — normal, só confirme o acesso pelo dono da conta do GitHub.

## 1. Banco de dados (Neon)

1. Crie uma conta em [neon.tech](https://neon.tech) e um projeto novo.
2. No painel do projeto, pegue duas connection strings:
   - **Pooled connection** (tem `-pooler` no host) → vai em `DATABASE_URL`.
   - **Direct connection** (sem `-pooler`) → vai em `DIRECT_DATABASE_URL`.
   - Migrations (DDL) não funcionam de forma confiável através do pooler —
     por isso o schema (`server/prisma/schema.prisma`) já declara as duas
     (`url` e `directUrl`); localmente, sem pooler, elas apontam pro mesmo
     banco (ver `server/.env.example`).
3. Depois de configurar as variáveis (seção 4), rode as migrations contra o
   Neon a partir da sua máquina (uma vez, antes do primeiro deploy):
   ```bash
   cd server
   npx prisma migrate deploy
   npx prisma db execute --file prisma/manual-sql/001_appointment_no_overlap.sql --schema prisma/schema.prisma
   npm run seed
   ```

## 2. Armazenamento de arquivo (Cloudflare R2)

Fotos de paciente e fichas digitalizadas hoje ficam em `server/uploads/` —
isso funciona em desenvolvimento, mas **desaparece a cada deploy** em
qualquer hospedagem com disco efêmero (Railway incluso). `lib/file-storage.ts`
já sabe usar R2 automaticamente quando configurado (compatível com a API S3,
usa `@aws-sdk/client-s3`) — sem essas variáveis, continua caindo para disco
local sem quebrar nada.

1. No painel da Cloudflare, crie um bucket R2 (ex.: `noely-cerqueira-uploads`).
2. Em **R2 > Manage API Tokens**, crie um token com permissão de leitura e
   escrita nesse bucket. Anote: Account ID, Access Key ID, Secret Access Key.
3. Configure as 4 variáveis descritas em `server/.env.example` (seção R2).

## 3. API (Railway)

1. Crie um projeto no Railway e conecte o repositório do GitHub.
2. Configure o **root directory** do serviço como `server/`.
3. Build command: `npm run build` · Start command: `npm start` (já existem
   em `server/package.json`).
4. Configure as variáveis de ambiente (seção 4 abaixo) no painel do Railway.
5. Cada push na branch principal faz deploy automático.

## 4. Variáveis de ambiente da API em produção

Todas descritas com comentário em `server/.env.example` — resumo do que
muda em relação ao `.env` local:

| Variável | Valor em produção |
|---|---|
| `DATABASE_URL` | Connection string **pooled** do Neon |
| `DIRECT_DATABASE_URL` | Connection string **direta** do Neon |
| `JWT_SECRET` | Novo valor aleatório (não reaproveitar o de dev) — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `WEB_ORIGIN` | URL pública do site no Cloudflare Pages (ex.: `https://noelycerqueira.com.br`) |
| `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` | Credenciais reais do admin (senha forte, não a de dev) |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | Do bucket criado na seção 2 |
| `WHATSAPP_CLOUD_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Se for usar lembretes por WhatsApp — opcional |

## 5. Site (Cloudflare Pages)

1. Crie um projeto no Cloudflare Pages conectado ao mesmo repositório.
2. Root directory: `web/` · Build command: `npm run build` · Output
   directory: `dist`.
3. Variável de ambiente de build: `VITE_API_URL` = URL pública da API no
   Railway (ex.: `https://noely-cerqueira-api.up.railway.app`).
4. `web/public/_redirects` já está no projeto — necessário para as rotas do
   Vue Router (ex. `/servicos`, `/agendar`) funcionarem em recarregamento
   direto num host de arquivos estáticos, sem servidor próprio de rotas.

## O que já está pronto no código para isso

- `server/prisma/schema.prisma` — `directUrl` para o padrão pooled/direct do Neon.
- `server/src/lib/file-storage.ts` — usa R2 automaticamente quando configurado, disco local como padrão em dev.
- `server/src/config/env.ts` — variáveis de R2 validadas e documentadas.
- `web/public/_redirects` — roteamento SPA para Cloudflare Pages.

## Ponto de atenção — LGPD

Dados de saúde são sensíveis. Neon, Railway e Cloudflare têm datacenters
fora do Brasil (normalmente EUA/UE) — isso é comum e legal com as
salvaguardas contratuais certas, mas vale confirmar com quem cuida da parte
jurídica da clínica antes do primeiro deploy com dados reais de pacientes.
