import { apiRequest } from './api';
import type { Appointment, CustomerInput } from '@/types';

interface CreateAppointmentPayload {
  serviceIds: string[];
  startAt: string;
  customer: CustomerInput;
  notes?: string;
  fitIn?: boolean; // só no painel (Encaixe)
}

export function createAppointment(payload: CreateAppointmentPayload) {
  return apiRequest<{ appointment: Appointment }>('/appointments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// Agendamento pelo painel: vários serviços em sequência e encaixe em
// qualquer horário (ver createInternalAppointments no servidor).
export function createInternalAppointment(payload: CreateAppointmentPayload) {
  return apiRequest<{ ids: string[] }>('/appointments/internal', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
