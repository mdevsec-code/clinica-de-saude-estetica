import { apiRequest } from './api';
import type { AdminAppointment, AdminBlockedTime, AppointmentStatus, GoogleCalendarSyncStatus } from '@/types';

function rangeSuffix(params?: { from?: string; to?: string }) {
  const query = new URLSearchParams();
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  return query.toString() ? `?${query.toString()}` : '';
}

export function fetchAppointments(params?: { from?: string; to?: string }) {
  return apiRequest<{ appointments: AdminAppointment[] }>(`/appointments${rangeSuffix(params)}`);
}

export function fetchBlockedTimes(params?: { from?: string; to?: string }) {
  return apiRequest<{ blockedTimes: AdminBlockedTime[] }>(`/appointments/blocked-times${rangeSuffix(params)}`);
}

export function fetchGoogleCalendarStatus() {
  return apiRequest<GoogleCalendarSyncStatus>('/integrations/google-calendar/status');
}

export function syncGoogleCalendarNow() {
  return apiRequest<GoogleCalendarSyncStatus>('/integrations/google-calendar/sync', { method: 'POST' });
}

export function updateAppointmentStatus(id: string, status: AppointmentStatus) {
  return apiRequest<{ appointment: AdminAppointment }>(`/appointments/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
