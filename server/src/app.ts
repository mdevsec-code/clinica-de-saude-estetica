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

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN }));
  // Limite padrão do Express (100kb) é apertado para o upload de extrato OFX
  // (POST /finance/bank/import) e, agora, para fotos de paciente em base64
  // (POST /patients/:id/photos, ver patients.service.ts) — uma foto de
  // celular comprimida passa de 5mb com alguma folga.
  app.use(express.json({ limit: '10mb' }));
  app.use(pinoHttp());

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

  app.use(errorHandler);

  return app;
}
