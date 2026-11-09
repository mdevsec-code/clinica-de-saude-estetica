#!/usr/bin/env bash
# Publica a versão mais recente da branch main na VPS (ver DEPLOY.md,
# seção 6). Rodar como o usuário deploy:
#   ~/clinica/deploy/hostinger/update.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$APP_DIR"

git pull --ff-only origin main

cd "$APP_DIR/server"
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
pm2 reload clinica-api

# VITE_API_URL vem de web/.env.production (criado na seção 5 do DEPLOY.md)
# — o Vite embute o valor no bundle em tempo de build.
cd "$APP_DIR/web"
npm ci
npm run build

echo "Deploy concluído."
