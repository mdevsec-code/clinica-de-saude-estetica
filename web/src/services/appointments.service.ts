import { apiRequest } from './api';
import type { Appointment, CustomerInput } from '@/types';

interface CreateAppointmentPayload {
  serviceId: string;
  startAt: string;
  customer: CustomerInput;
  notes?: string;
}

export function createAppointment(payload: CreateAppointmentPayload) {
  return apiRequest<{ appointment: Appointment }>('/appointments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// Agendamento pelo painel: vários serviços em sequência e encaixe em
// qualquer horário (ver createInternalAppointments no servidor).
export function createInternalAppointment(payload: Omit<CreateAppointmentPayload, 'serviceId'> & { serviceIds: string[] }) {
  return apiRequest<{ ids: string[] }>('/appointments/internal', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
