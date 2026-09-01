import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import { getDashboardStats } from './dashboard.service';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth, requireRole('ADMIN', 'RECEPTION'));

dashboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const daysParam = Number(req.query.days);
    const chartDays = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 14;
    const stats = await getDashboardStats(req.tenant.id, chartDays);
    res.json(stats);
  }),
);
