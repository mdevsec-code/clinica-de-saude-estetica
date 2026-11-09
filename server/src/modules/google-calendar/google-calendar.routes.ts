import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import { getGoogleCalendarSyncStatus, runGoogleCalendarSync } from './google-calendar.service';

export const googleCalendarRouter = Router();

googleCalendarRouter.get(
  '/status',
  requireAuth,
  requireRole('ADMIN', 'RECEPTION'),
  asyncHandler(async (_req, res) => {
    res.json(getGoogleCalendarSyncStatus());
  }),
);

// "Sincronizar agora" da agenda do painel — para quando a Noely acabou de
// marcar um compromisso no Google e não quer esperar a próxima rodada
// automática (GOOGLE_CALENDAR_SYNC_INTERVAL_MIN).
googleCalendarRouter.post(
  '/sync',
  requireAuth,
  requireRole('ADMIN', 'RECEPTION'),
  asyncHandler(async (_req, res) => {
    res.json(await runGoogleCalendarSync());
  }),
);
