# Guia de deploy em produção — VPS Hostinger

Tudo em um único servidor, num único fornecedor:

| Peça | Onde roda na VPS |
|---|---|
| Site (`web/`) | Arquivos estáticos do build (`web/dist`) servidos pelo Nginx |
| API (`server/`) | Node.js mantido no ar pelo pm2, atrás do Nginx em `/api` |
| Banco de dados | PostgreSQL instalado na própria VPS (acessível só por `localhost`) |
| Fotos de paciente e fichas digitalizadas | Disco da VPS (`server/uploads/`) — persistente, ao contrário de Railway/Render |
| HTTPS | Let's Encrypt via certbot (grátis, renova sozinho) |

Arquivos prontos para isso em [`deploy/hostinger/`](deploy/hostinger/):

| Arquivo | Para quê |
|---|---|
| `nginx.conf` | Site + proxy da API + rotas do Vue Router + limite de upload |
| `security-headers.conf` | Cabeçalhos de segurança do site (CSP, anti-iframe, HSTS) — incluído pelo `nginx.conf` |
| `ecosystem.config.js` | Configuração do pm2 para a API |
| `update.sh` | Publica uma versão nova (pull, migrations, build, reload) |
| `backup.sh` | Backup diário do banco e das fotos/fichas, com rotação |

Os comandos abaixo usam `noelycerqueira.com.br` como domínio de exemplo e
`IP_DA_VPS` como o IP do servidor — troque pelos reais.

> ⚠️ **Repositório privado**: a VPS precisa de uma *deploy key* para clonar
> o repositório (seção 4) — é uma chave só de leitura, só deste repositório,
> configurada pelo dono da conta do GitHub.

## 1. Criar a VPS e apontar o domínio

1. No hPanel da Hostinger, contrate uma **VPS KVM** (o KVM 1 já sobra para
   o volume atual; dá para subir de plano depois sem reinstalar).
2. Sistema operacional: **Ubuntu 24.04 LTS** (o "plain OS", sem painel).
3. **Datacenter**: escolha o do Brasil se o plano oferecer — ver "LGPD" no fim.
4. Cadastre sua **chave SSH** na criação (mais seguro que senha de root).
   No Windows, se ainda não tiver uma: `ssh-keygen -t ed25519` no PowerShell
   e cole o conteúdo de `~/.ssh/id_ed25519.pub`.
5. Em **Domínios > DNS**, crie dois registros **A** apontando para o IP da VPS:
   `@` e `www`. A propagação leva de minutos a algumas horas — o certbot
   (seção 5) só funciona depois disso.

## 2. Preparar o servidor

Conecte como root (`ssh root@IP_DA_VPS`) e rode:

```bash
apt update && apt upgrade -y
apt install -y git rsync nginx postgresql postgresql-contrib certbot python3-certbot-nginx ufw

# Node.js 24 (mesma versão usada no desenvolvimento) + pm2
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs
npm install -g pm2

# Usuário sem privilégio de root para rodar a aplicação
adduser --disabled-password --gecos "" deploy
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh
chmod 755 /home/deploy   # o Nginx precisa ler web/dist

# Firewall: só SSH e web. A porta 5432 do Postgres NÃO fica aberta.
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

Também vale ligar o **firewall da própria Hostinger** (hPanel > VPS >
Segurança) com as mesmas regras, e os **snapshots/backups automáticos** da
VPS, como segunda camada além da seção 7.

## 3. Banco de dados: migrar o banco atual

### 3.1 Conferir versões

`pg_restore` não restaura um dump de um Postgres **mais novo** que o do
servidor. Compare:

```bash
psql --version          # na sua máquina
psql --version          # na VPS (Ubuntu 24.04 vem com o 16)
```

Se o local for mais novo (ex.: 17), instale a mesma versão na VPS pelo
repositório oficial do PostgreSQL antes de continuar (`apt install
postgresql-common && /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh`,
depois `apt install postgresql-17`).

### 3.2 Criar banco e usuário na VPS

Ainda como root, com uma senha forte (diferente da de dev):

```bash
sudo -u postgres psql -c "CREATE USER noely WITH PASSWORD 'SENHA_FORTE_AQUI';"
sudo -u postgres psql -c "CREATE DATABASE noely_cerqueira OWNER noely;"
```

### 3.3 Exportar o banco local (na sua máquina, PowerShell)

```powershell
cd C:\Users\...\clinica-de-saúde
pg_dump -U noely -h localhost -Fc --no-owner --no-acl noely_cerqueira -f noely.dump
```

- Se `pg_dump` não for reconhecido, ele fica em
  `C:\Program Files\PostgreSQL\<versão>\bin\pg_dump.exe`.
- Se o Postgres local roda em Docker:
  `docker exec <container> pg_dump -U noely -Fc --no-owner --no-acl noely_cerqueira > noely.dump`
  (no PowerShell, prefira rodar isso pelo Git Bash — o `>` do PowerShell 5
  corrompe arquivo binário).

O dump completo já leva junto o histórico de migrations do Prisma
(`_prisma_migrations`) e a constraint de
[`001_appointment_no_overlap.sql`](server/prisma/manual-sql/001_appointment_no_overlap.sql) —
não precisa rodar nada disso de novo depois.

### 3.4 Enviar e restaurar

```powershell
scp noely.dump deploy@IP_DA_VPS:/tmp/
```

Na VPS:

```bash
pg_restore --no-owner --no-acl \
  -d "postgresql://noely:SENHA_FORTE_AQUI@localhost:5432/noely_cerqueira" \
  /tmp/noely.dump
rm /tmp/noely.dump
```

> O dump tem dados reais de pacientes — envie só por `scp`, nunca por
> e-mail/WhatsApp/drive, e apague as cópias (na VPS e no PC) depois de
> confirmar que a restauração funcionou.

**Não rode `npm run seed` depois de restaurar** — os dados já estão lá. O
seed só é necessário se for começar com um banco vazio (aí, em vez das
seções 3.3/3.4, rode `npx prisma migrate deploy`, o `db execute` do SQL
manual e `npm run seed` depois da seção 4).

## 4. API

Como usuário deploy (`ssh deploy@IP_DA_VPS`):

### 4.1 Clonar o repositório privado

```bash
ssh-keygen -t ed25519 -C "vps-clinica" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

No GitHub: repositório > **Settings > Deploy keys > Add deploy key**, cole a
chave, **sem** marcar "Allow write access". Depois:

```bash
git clone git@github.com:mdevsec-code/clinica-de-saude-estetica.git ~/clinica
chmod +x ~/clinica/deploy/hostinger/*.sh
```

### 4.2 Configurar `server/.env`

```bash
cp ~/clinica/server/.env.example ~/clinica/server/.env
chmod 600 ~/clinica/server/.env
nano ~/clinica/server/.env
```

| Variável | Valor em produção |
|---|---|
| `DATABASE_URL` | `postgresql://noely:SENHA_FORTE_AQUI@localhost:5432/noely_cerqueira?schema=public` |
| `DIRECT_DATABASE_URL` | Igual à `DATABASE_URL` (sem pooler na VPS) |
| `JWT_SECRET` | Novo valor aleatório (não reaproveitar o de dev) — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `WEB_ORIGIN` | `https://noelycerqueira.com.br` |
| `TRUST_PROXY` | `"true"` — a API fica atrás do Nginx (ver comentário em `server/src/config/env.ts`) |
| `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` | Só usados pelo seed — com o banco restaurado, podem ficar como estão |
| `WHATSAPP_CLOUD_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Os mesmos do ambiente atual (ver seção 8) |
| `R2_*` | **Deixar comentadas** — na VPS o disco é persistente, e `lib/file-storage.ts` usa `server/uploads/` automaticamente |

### 4.3 Copiar fotos e fichas digitalizadas

Da sua máquina (PowerShell):

```powershell
scp -r server\uploads deploy@IP_DA_VPS:~/clinica/server/
```

### 4.4 Build e subir com pm2

```bash
cd ~/clinica/server
npm ci
npx prisma generate
npx prisma migrate deploy   # com o banco restaurado, deve dizer "No pending migrations"
npm run build

pm2 start ~/clinica/deploy/hostinger/ecosystem.config.js
pm2 save
pm2 startup   # imprime um comando "sudo env PATH=..." — rode-o como root
curl http://127.0.0.1:3333/health   # → {"status":"ok"}
```

## 5. Site, Nginx e HTTPS

Ainda como deploy:

```bash
echo 'VITE_API_URL="https://noelycerqueira.com.br/api"' > ~/clinica/web/.env.production
cd ~/clinica/web
npm ci
npm run build
```

`VITE_API_URL` é embutida no bundle **em tempo de build** — se mudar o
domínio, edite `.env.production` e rode o build de novo.

Como root, edite o domínio em `deploy/hostinger/nginx.conf` (se não for o de
exemplo) e instale:

```bash
cp /home/deploy/clinica/deploy/hostinger/security-headers.conf /etc/nginx/snippets/clinica-security-headers.conf
cp /home/deploy/clinica/deploy/hostinger/nginx.conf /etc/nginx/sites-available/clinica
ln -s /etc/nginx/sites-available/clinica /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

certbot --nginx -d noelycerqueira.com.br -d www.noelycerqueira.com.br
```

O certbot adiciona o HTTPS e o redirecionamento de HTTP sozinho, e agenda a
renovação automática (`systemctl list-timers | grep certbot` para conferir).

## 6. Publicar atualizações

Depois de dar push na `main`:

```bash
ssh deploy@IP_DA_VPS
~/clinica/deploy/hostinger/update.sh
```

Ele faz `git pull`, instala dependências, aplica migrations novas, recompila
a API, recarrega o pm2 e refaz o build do site. Se uma migration nova vier
acompanhada de SQL manual em `server/prisma/manual-sql/`, rode-o à parte
(`npx prisma db execute --file ... --schema prisma/schema.prisma`).

Logs da API: `pm2 logs clinica-api`.

## 7. Backups

Sem Neon, o backup passa a ser responsabilidade da instalação. Como deploy:

```bash
~/clinica/deploy/hostinger/backup.sh   # teste manual
crontab -e
# adicione:
0 3 * * * /home/deploy/clinica/deploy/hostinger/backup.sh >> /home/deploy/backups/backup.log 2>&1
```

Todo dia às 3h salva o banco (`db-AAAA-MM-DD.dump`) e as fotos/fichas
(`uploads-AAAA-MM-DD/`) em `~/backups`, guardando os últimos 14 dias. Cada
pasta `uploads-*` é um snapshot completo daquele dia, mas fotos que não
mudaram são *hardlinks* para o snapshot anterior — então 14 dias de backup
ocupam mais ou menos o tamanho das fotos uma vez, mais o que entrou de novo
no período (e não 14 vezes o tamanho, como um `.tar.gz` diário ocuparia).
Para conferir o espaço real: `du -sh ~/backups`.

**Backup na mesma máquina não protege contra perder a máquina.** Copie
periodicamente para fora — no mínimo, o dump e o snapshot mais recentes,
da sua máquina (PowerShell; troque a data):

```powershell
scp deploy@IP_DA_VPS:~/backups/db-AAAA-MM-DD.dump C:\Backups\clinica\
scp -r deploy@IP_DA_VPS:~/backups/uploads-AAAA-MM-DD C:\Backups\clinica\
```

Não copie a pasta `~/backups` inteira com `scp -r`: ele não preserva os
hardlinks e baixaria todas as fotos 14 vezes.

…e mantenha os snapshots da Hostinger ligados. Para restaurar, ver o
comentário no topo de `backup.sh`. Vale testar uma restauração completa
uma vez, num banco de teste, antes de precisar de verdade.

## 8. WhatsApp e Google Calendar

- **WhatsApp (Cloud API da Meta)**: os envios são disparados pelo painel
  (não há webhook nem cron na API hoje — ver `notifications.service.ts`),
  então basta preencher `WHATSAPP_CLOUD_API_TOKEN` e
  `WHATSAPP_PHONE_NUMBER_ID` no `.env` e `pm2 reload clinica-api`. Se no
  futuro for configurado um webhook no painel da Meta, a URL será
  `https://noelycerqueira.com.br/api/<rota>` (a Meta exige HTTPS — já
  coberto pela seção 5).
- **Google Calendar**: no Google Cloud Console, em **APIs e serviços >
  Credenciais**, adicione o domínio novo nas *Authorized JavaScript origins*
  e nas *Authorized redirect URIs* do cliente OAuth (ex.:
  `https://noelycerqueira.com.br/api/...` — o caminho exato da rota de
  callback). Sem isso, o login com o Google falha com `redirect_uri_mismatch`.

## Checklist depois do primeiro deploy

- [ ] `https://noelycerqueira.com.br` abre o site, com cadeado.
- [ ] Recarregar direto em `/agendar` ou `/admin` não dá 404.
- [ ] Login no painel funciona e mostra os pacientes/agendamentos migrados.
- [ ] Uma foto antiga de paciente abre (confirma a cópia de `uploads/`).
- [ ] Upload de uma foto nova funciona.
- [ ] Envio de um WhatsApp de teste funciona.
- [ ] `~/backups` tem o dump do dia seguinte.
- [ ] `ssh root@IP_DA_VPS` com senha está desabilitado (só chave):
      `PasswordAuthentication no` em `/etc/ssh/sshd_config`.

## Ponto de atenção — LGPD

Dados de saúde são sensíveis. Com tudo numa VPS só, a responsabilidade de
segurança (atualizações do sistema, firewall, backups, acesso SSH) passa a
ser da própria clínica, não de um provedor gerenciado — mantenha `apt
upgrade` em dia (ou ative `unattended-upgrades`). Hospedar em datacenter no
Brasil simplifica a questão de transferência internacional de dados, mas
vale confirmar com quem cuida da parte jurídica da clínica antes do
primeiro deploy com dados reais de pacientes.
