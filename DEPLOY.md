# Guia de deploy em produção

> **Produção atual (desde out/2026): VPS Hostinger KVM 2.** API e banco
> saíram do Railway/Neon e rodam numa VPS própria — ver
> [VPS Hostinger](#vps-hostinger-produção-atual) no fim deste guia. Desde
> nov/2026 o site também roda na VPS (a Netlify foi desligada), em
> `https://noelycerqueira.com.br`. As seções 1–5 abaixo descrevem a stack
> anterior (Railway + Neon + Supabase + Netlify), mantidas só como histórico —
> o `web/netlify.toml` citado nelas foi removido.

Stack recomendada (custo-benefício para o tamanho atual, com espaço para
crescer conforme o volume de pacientes aumenta):

| Peça | Serviço | Por quê |
|---|---|---|
| API (`server/`) | [Railway](https://railway.app) | Deploy via git, HTTPS automático, sem DevOps |
| Site (`web/`) | [Netlify](https://netlify.com) | CDN global, grátis, desacoplado do custo da API, domínio próprio com HTTPS automático |
| Banco de dados | [Neon](https://neon.tech) | Postgres serverless, separa storage de computação, branching para testar migrations com segurança |
| Fotos de paciente e fichas digitalizadas | [Supabase Storage](https://supabase.com/storage) | Free tier permanente (não expira), compatível com S3 — resolve o problema do disco local, que é apagado a cada deploy no Railway |

Custo estimado para começar: ~R$0–65/mês (Supabase Storage e o plano
gratuito da Netlify cobrem bem o volume inicial), crescendo só conforme o
uso real.

O código já está preparado para essa stack (ver "O que já está pronto"
abaixo) — falta só criar as contas, os recursos, e configurar as variáveis
de ambiente descritas aqui.

> ⚠️ **Repositório privado**: ao conectar o Railway e a Netlify ao GitHub
> (seções 3 e 5), a tela de autorização do GitHub vai pedir acesso explícito
> a este repositório especificamente (repos privados não aparecem por
> padrão) — normal, só confirme o acesso pelo dono da conta do GitHub.

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

## 2. Armazenamento de arquivo (Supabase Storage)

Fotos de paciente e fichas digitalizadas hoje ficam em `server/uploads/` —
isso funciona em desenvolvimento, mas **desaparece a cada deploy** em
qualquer hospedagem com disco efêmero (Railway incluso). `lib/file-storage.ts`
já sabe usar um storage S3-compatível automaticamente quando configurado
(usa `@aws-sdk/client-s3`, endpoint/região genéricos) — sem essas variáveis,
continua caindo para disco local sem quebrar nada.

1. Crie uma conta em [supabase.com](https://supabase.com) e um projeto novo
   (o projeto também sobe um Postgres próprio — ignore-o, o banco desta
   aplicação continua sendo o Neon da seção 1).
2. No painel do projeto, vá em **Storage** e crie um bucket (ex.:
   `noely-cerqueira-uploads`). Deixe como **privado** (não público) — o
   acesso aos arquivos é sempre por rota autenticada da própria API, nunca
   direto do storage.
3. Vá em **Project Settings > Storage > S3 Connection** e gere um par de
   credenciais S3 (Access Key ID / Secret Access Key) — são diferentes das
   chaves `anon`/`service_role` do resto do Supabase. Anote também o
   **Endpoint** e a **Region** mostrados nessa mesma tela.
4. Configure as 5 variáveis descritas em `server/.env.example` (seção S3).

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
| `WEB_ORIGIN` | URL pública do site na Netlify (ex.: `https://noelycerqueira.com.br`) |
| `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` | Credenciais reais do admin (senha forte, não a de dev) |
| `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME` | Do bucket criado na seção 2 (Supabase Storage) |
| `WHATSAPP_CLOUD_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Se for usar lembretes por WhatsApp — opcional |

## 5. Site (Netlify)

1. Crie uma conta em [netlify.com](https://netlify.com) → **Add new site >
   Import an existing project** → conecte o mesmo repositório GitHub.
2. **Base directory**: `web`. Build command e Publish directory a Netlify
   já lê de `web/netlify.toml` (`npm run build` / `dist`) — confirme que
   veio certo antes de finalizar.
3. Em **Site configuration > Environment variables**: `VITE_API_URL` = URL
   pública da API no Railway (ex.: `https://noely-cerqueira-api.up.railway.app`).
4. **Deploy site**. Você recebe uma URL tipo `nome-aleatorio.netlify.app`
   (pode renomear em **Site configuration > General > Site details**).
5. `web/netlify.toml` já está no projeto — necessário para as rotas do Vue
   Router (ex. `/servicos`, `/agendar`) funcionarem em recarregamento direto
   num host de arquivos estáticos, sem servidor próprio de rotas.
6. **Domínio próprio**: em **Domain management > Add a domain**, informe o
   domínio da clínica e siga as instruções de DNS mostradas na tela
   (Netlify emite o certificado HTTPS automaticamente depois que o DNS
   propaga — geralmente minutos, às vezes até 24h).

## O que já está pronto no código para isso

- `server/prisma/schema.prisma` — `directUrl` para o padrão pooled/direct do Neon.
- `server/src/lib/file-storage.ts` — usa storage S3-compatível automaticamente quando configurado, disco local como padrão em dev.
- `server/src/config/env.ts` — variáveis de storage (`S3_*`) validadas e documentadas.

## VPS Hostinger (produção atual)

| Peça | Onde |
|---|---|
| Sistema | Ubuntu 26.04, firewall `ufw` liberando só 22/80/443 |
| Banco | PostgreSQL 18 local, escutando só em `127.0.0.1` — banco `noely_cerqueira`, dono `noely` (restaurado do Neon com `pg_dump`/`pg_restore` 18) |
| API | `/opt/noely/server`, serviço systemd `noely-api` rodando com usuário sem privilégios `noely-api`; `.env` em `/opt/noely/server/.env` (chmod 600) com `TRUST_PROXY=1` |
| Domínio | `noelycerqueira.com.br` (DNS na zona do Registro.br: `@`, `www` e `api` → A `179.236.83.106`) |
| HTTPS | Nginx + Let's Encrypt via `acme.sh` (webroot `/var/www/html`, renovação automática): `noely-domain` = `api.noelycerqueira.com.br` → API; `noely-site` = site, com `www` redirecionando para o domínio sem www; `noely-api` = o IP puro (legado) |
| Arquivos | Disco local (`/opt/noely/server/uploads`) — na VPS o disco não é apagado a cada deploy, então o S3 é opcional |
| Site | Arquivos estáticos em `/var/www/noely-site`, servidos pelo Nginx (rotas do Vue caem no `index.html`) |
| CORS / links | `.env` da API: `WEB_ORIGIN=https://noelycerqueira.com.br` (também é o link `{LinkAgendamento}` das mensagens) e `WEB_ORIGIN_EXTRA=https://www.noelycerqueira.com.br` |

Atualizar a API (a partir do repositório local, sem git na VPS):

```bash
git ls-files server > /tmp/files.txt && tar -cf server.tar -T /tmp/files.txt
scp server.tar root@<IP>:/tmp/
ssh root@<IP> 'tar -xf /tmp/server.tar -C /opt/noely && rm /tmp/server.tar \
  && chown -R noely-api:noely-api /opt/noely && cd /opt/noely/server \
  && sudo -u noely-api -H npm ci && sudo -u noely-api -H npx prisma generate \
  && sudo -u noely-api -H npm run build && sudo -u noely-api -H npx prisma migrate deploy \
  && systemctl restart noely-api'
```

Atualizar o site: o build precisa de `web/.env.production` (fora do git)
com `VITE_API_URL="https://api.noelycerqueira.com.br"`. A versão anterior
fica em `/var/www/noely-site.old` para voltar rápido se precisar.

```bash
cd web && npm run build && tar -czf /tmp/site.tgz -C dist .
scp /tmp/site.tgz root@<IP>:/tmp/
ssh root@<IP> 'rm -rf /var/www/noely-site.new && mkdir /var/www/noely-site.new   && tar -xzf /tmp/site.tgz -C /var/www/noely-site.new && chown -R www-data:www-data /var/www/noely-site.new   && rm -rf /var/www/noely-site.old && mv /var/www/noely-site /var/www/noely-site.old   && mv /var/www/noely-site.new /var/www/noely-site'
```

## Google Agenda

O que a integração faz (código em `server/src/modules/google-calendar/`):

- **Paciente**: depois de agendar no site, botão "Adicionar ao Google
  Agenda" (só um link pré-preenchido — funciona sem configurar nada).
- **Site → agenda da clínica**: todo agendamento confirmado vira um evento
  ("Ana — Limpeza de pele", sem telefone nem dado de saúde); cancelar apaga.
- **Agenda da clínica → site**: compromissos marcados direto no Google
  (exceto os marcados como "Livre") fecham o horário no site. Sincroniza a
  cada 5 minutos e pelo botão "Sincronizar agora" na Agenda do painel.

Para ligar (uma vez):

1. Em [console.cloud.google.com](https://console.cloud.google.com), crie um
   projeto e ative a **Google Calendar API** (APIs e serviços → Biblioteca).
2. **IAM e administrador → Contas de serviço → Criar conta de serviço**
   (nome livre, sem papéis). Na conta criada: **Chaves → Adicionar chave →
   JSON**. Guarde o arquivo baixado — é a senha do robô.
3. No Google Agenda da clínica (no computador): **Configurações da agenda →
   Compartilhar com pessoas específicas** → adicione o e-mail da conta de
   serviço (`...@...iam.gserviceaccount.com`) com **Fazer alterações nos
   eventos**. Na mesma tela, copie o **ID da agenda** (para a agenda
   principal, é o próprio Gmail).
4. Na VPS: copie o JSON para `/opt/noely/server/google-service-account.json`
   (`chown noely-api` + `chmod 600`), defina `GOOGLE_CALENDAR_ID` e
   `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` no `.env` e `systemctl restart noely-api`.

Limitações conhecidas: mover ou apagar no Google um evento criado pelo site
não altera o agendamento (o painel é a fonte de verdade — a próxima mudança
de status no painel recria/apaga o evento); compromisso marcado no Google
leva até 5 minutos para fechar o horário no site.

## WhatsApp automático (QR code)

O que faz (código em `server/src/modules/whatsapp/`): confirmação logo após o
agendamento no site, agradecimento quando a paciente responde "SIM", lembrete
1 dia antes e 2 horas antes, e boas-vindas para quem escreve para a clínica.
Os textos ficam editáveis no painel, aba **WhatsApp**.

Para ligar (uma vez): no painel, aba **WhatsApp → Conectar WhatsApp**, e no
celular da clínica **WhatsApp → Aparelhos conectados → Conectar aparelho**,
escaneando o QR. Depois do deploy com as migrations novas, rode
`systemctl restart noely-api` e conecte.

A sessão fica em `/opt/noely/server/.whatsapp-session/` (fora do git). Ela é
a "senha" do aparelho conectado:

- O serviço roda com `ProtectSystem=strict`, então a pasta precisa existir
  (`install -d -o noely-api -g noely-api -m 700 /opt/noely/server/.whatsapp-session`)
  e estar liberada para escrita em
  `/etc/systemd/system/noely-api.service.d/whatsapp-session.conf`
  (`[Service]` + `ReadWritePaths=/opt/noely/server/.whatsapp-session`).
- O deploy por `tar -xf` não apaga essa pasta; não a remova ao atualizar.
- Inclua-a no backup (`tar -czf whatsapp-session.tgz -C /opt/noely/server
  .whatsapp-session`), com o mesmo cuidado do `.env`. Sem ela, basta
  escanear o QR de novo.
- Com o QR conectado, a confirmação vai por ele; a Cloud API da Meta
  (`WHATSAPP_CLOUD_API_TOKEN`) fica só como reserva dos avisos da ficha.

## Ponto de atenção — LGPD

Dados de saúde são sensíveis. Neon, Railway, Netlify e Supabase têm
datacenters fora do Brasil (normalmente EUA/UE) — isso é comum e legal com
as salvaguardas contratuais certas, mas vale confirmar com quem cuida da
parte jurídica da clínica antes do primeiro deploy com dados reais de
pacientes.
