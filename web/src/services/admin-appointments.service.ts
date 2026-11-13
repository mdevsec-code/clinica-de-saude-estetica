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

export function createBlockedTime(payload: { startAt: string; endAt: string; reason?: string }) {
  return apiRequest<{ blockedTime: AdminBlockedTime }>('/appointments/blocked-times', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteBlockedTime(id: string) {
  return apiRequest<void>(`/appointments/blocked-times/${id}`, { method: 'DELETE' });
}

export function fetchGoogleCalendarStatus() {
  return apiRequest<GoogleCalendarSyncStatus>('/integrations/google-calendar/status');
}

export function syncGoogleCalendarNow() {
  return apiRequest<GoogleCalendarSyncStatus>('/integrations/google-calendar/sync', { method: 'POST' });
}

export function checkoutAppointments(payload: {
  items: { id: string; chargedCents: number }[];
  payments: { method: string; amountCents: number }[];
}) {
  return apiRequest<{ ids: string[]; feeCents: number }>('/appointments/checkout', { method: 'POST', body: JSON.stringify(payload) });
}

export function setClientConfirmed(id: string, confirmed: boolean) {
  return apiRequest<{ ok: true }>(`/appointments/${id}/client-confirmed`, { method: 'PATCH', body: JSON.stringify({ confirmed }) });
}

export function updateAppointmentStatus(id: string, status: AppointmentStatus) {
  return apiRequest<{ appointment: AdminAppointment }>(`/appointments/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

// Taxas da maquininha, em centésimos de % (199 = 1,99%).
export interface CardFees {
  cardFeeDebitBps: number;
  cardFeeCreditBps: number;
  cardFeeInstallmentBps: number;
}

export function fetchCardFees() {
  return apiRequest<{ cardFees: CardFees }>('/finance/card-fees');
}

export function saveCardFees(cardFees: CardFees) {
  return apiRequest<{ cardFees: CardFees }>('/finance/card-fees', { method: 'PUT', body: JSON.stringify(cardFees) });
}
