import { apiRequest } from './api';

export interface ScheduleDay {
  weekday: number; // 0 = domingo … 6 = sábado
  open: boolean;
  opensAt: string;
  closesAt: string;
}

export interface Schedule {
  days: ScheduleDay[];
  lunch: { enabled: boolean; start: string; end: string };
}

export function fetchSchedule() {
  return apiRequest<Schedule>('/settings/schedule');
}

export function saveSchedule(schedule: Schedule) {
  return apiRequest<Schedule>('/settings/schedule', { method: 'PUT', body: JSON.stringify(schedule) });
}
