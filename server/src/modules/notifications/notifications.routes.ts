import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import { listNotifications } from './notifications.service';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth, requireRole('ADMIN', 'RECEPTION'));

// As 5 mais recentes — o sino guarda no navegador até onde já viu.
notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ notifications: await listNotifications(req.tenant.id) });
  }),
);
