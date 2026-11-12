import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { errorHandler } from './middleware/error-handler';
import { resolveTenant } from './middleware/tenant.middleware';
import { auditLogger } from './middleware/audit.middleware';
import { authRouter } from './modules/auth/auth.routes';
import { catalogRouter } from './modules/catalog/catalog.routes';
import { availabilityRouter } from './modules/availability/availability.routes';
import { appointmentsRouter } from './modules/appointments/appointments.routes';
import { settingsRouter } from './modules/settings/settings.routes';
import { financeRouter } from './modules/finance/finance.routes';
import { inventoryRouter } from './modules/inventory/inventory.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { auditRouter } from './modules/audit/audit.routes';
import { patientsRouter, remindersRouter } from './modules/patients/patients.routes';
import { messagesRouter } from './modules/messages/messages.routes';
import { whatsappRouter } from './modules/whatsapp/whatsapp.routes';
import { googleCalendarRouter } from './modules/google-calendar/google-calendar.routes';

export function createApp() {
  const app = express();

  app.set('trust proxy', env.TRUST_PROXY);
  app.use(helmet());
  // Sem isto o navegador (Safari no iPhone principalmente) podia reaproveitar
  // uma resposta antiga — ex.: o estoque aparecia diferente em cada login.
  // no-cache = sempre confere com o servidor (o ETag ainda evita baixar de novo).
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-cache');
    next();
  });
  app.use(cors({ origin: env.WEB_ORIGIN }));
  // Corpo grande (10mb) SÓ nas rotas de upload — extrato OFX e foto/ficha
  // digitalizada de paciente em base64 (uma foto de celular comprimida passa
  // de 5mb com alguma folga). Todas as demais, incluindo as públicas
  // (agendamento, login), ficam no padrão de 100kb: antes os 10mb valiam
  // para tudo, e qualquer visitante podia mandar corpos de 10mb em série
  // para o agendamento público e ocupar memória/CPU do servidor.
  const UPLOAD_ROUTES = [
    /^\/finance\/bank\/import$/,
    /^\/patients\/[^/]+\/photos$/,
    /^\/patients\/[^/]+\/fichas(\/[^/]+)?$/,
  ];
  const jsonLarge = express.json({ limit: '10mb' });
  const jsonDefault = express.json({ limit: '100kb' });
  app.use((req, res, next) =>
    (UPLOAD_ROUTES.some((re) => re.test(req.path)) ? jsonLarge : jsonDefault)(req, res, next),
  );
  // Log de requisição SEM cabeçalhos: o padrão do pino-http grava todos, e
  // com eles o `Authorization: Bearer <token>` de cada chamada do painel —
  // qualquer pessoa com acesso aos logs (pm2 logs na VPS) poderia copiar um
  // token e agir como a usuária por horas. A URL também sai com o `token=`
  // mascarado (rotas de arquivo de paciente o recebem pela query string).
  app.use(
    pinoHttp({
      serializers: {
        req: (req: { id: unknown; method: string; url: string; remoteAddress?: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url.replace(/([?&]token=)[^&]*/g, '$1[redacted]'),
          remoteAddress: req.remoteAddress,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // Toda rota de negócio passa por resolveTenant antes de tocar o banco —
  // é o ponto único que garante isolamento entre clínicas (item 7 do escopo).
  app.use(resolveTenant);

  // Antes das rotas de propósito: precisa registrar o listener de
  // res.on('finish') ANTES da rota rodar, mesmo que o próprio log só seja
  // escrito depois (ver comentário em audit.middleware.ts sobre por que
  // isso funciona mesmo estando antes de requireAuth de cada router).
  app.use(auditLogger);

  app.use('/auth', authRouter);
  app.use('/catalog', catalogRouter);
  app.use('/availability', availabilityRouter);
  app.use('/appointments', appointmentsRouter);
  app.use('/settings', settingsRouter);
  app.use('/finance', financeRouter);
  app.use('/inventory', inventoryRouter);
  app.use('/dashboard', dashboardRouter);
  app.use('/audit', auditRouter);
  app.use('/patients', patientsRouter);
  app.use('/reminders', remindersRouter);
  app.use('/message-templates', messagesRouter);
  app.use('/whatsapp', whatsappRouter);
  app.use('/integrations/google-calendar', googleCalendarRouter);

  app.use(errorHandler);

  return app;
}
