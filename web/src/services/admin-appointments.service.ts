import { apiRequest } from './api';
import type { AdminAppointment, AppointmentStatus } from '@/types';

export function fetchAppointments(params?: { from?: string; to?: string }) {
  const query = new URLSearchParams();
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return apiRequest<{ appointments: AdminAppointment[] }>(`/appointments${suffix}`);
}

export function updateAppointmentStatus(id: string, status: AppointmentStatus) {
  return apiRequest<{ appointment: AdminAppointment }>(`/appointments/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
