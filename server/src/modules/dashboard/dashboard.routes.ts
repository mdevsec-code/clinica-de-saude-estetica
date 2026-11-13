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
    // Recepção não vê valores de receita/gastos/saldo (pedido da clínica).
    if (req.user?.role !== 'ADMIN') {
      res.json({
        ...stats,
        revenueThisMonthCents: 0,
        expensesThisMonthCents: 0,
        balanceThisMonthCents: 0,
        revenueChangePct: null,
        expensesChangePct: null,
        avgTicketCents: 0,
        expensesByCategory: [],
        moneyHidden: true,
      });
      return;
    }
    res.json(stats);
  }),
);
