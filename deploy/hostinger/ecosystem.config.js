// pm2 — mantém a API rodando na VPS, reinicia se cair e sobe junto com o
// servidor depois de um reboot (ver DEPLOY.md, seção 4).
//
//   pm2 start deploy/hostinger/ecosystem.config.js
//   pm2 save && pm2 startup   (rode o comando que o "pm2 startup" imprimir)
//
// As variáveis de ambiente vêm de server/.env (dotenv, carregado em
// config/env.ts a partir do cwd) — não duplicar segredos aqui.
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'clinica-api',
      cwd: path.resolve(__dirname, '../../server'),
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
