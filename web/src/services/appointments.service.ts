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
