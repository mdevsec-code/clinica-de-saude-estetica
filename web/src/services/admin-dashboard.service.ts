import { apiRequest } from './api';
import type { DashboardStats } from '@/types';

export function fetchDashboardStats(chartDays = 14) {
  return apiRequest<DashboardStats>(`/dashboard?days=${chartDays}`);
}
