import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { errorHandler } from './middleware/error-handler';
import { resolveTenant } from './middleware/tenant.middleware';
import { authRouter } from './modules/auth/auth.routes';
import { catalogRouter } from './modules/catalog/catalog.routes';
import { availabilityRouter } from './modules/availability/availability.routes';
import { appointmentsRouter } from './modules/appointments/appointments.routes';
import { settingsRouter } from './modules/settings/settings.routes';
import { financeRouter } from './modules/finance/finance.routes';
import { inventoryRouter } from './modules/inventory/inventory.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN }));
  app.use(express.json());
  app.use(pinoHttp());

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // Toda rota de negócio passa por resolveTenant antes de tocar o banco —
  // é o ponto único que garante isolamento entre clínicas (item 7 do escopo).
  app.use(resolveTenant);

  app.use('/auth', authRouter);
  app.use('/catalog', catalogRouter);
  app.use('/availability', availabilityRouter);
  app.use('/appointments', appointmentsRouter);
  app.use('/settings', settingsRouter);
  app.use('/finance', financeRouter);
  app.use('/inventory', inventoryRouter);
  app.use('/dashboard', dashboardRouter);

  app.use(errorHandler);

  return app;
}
