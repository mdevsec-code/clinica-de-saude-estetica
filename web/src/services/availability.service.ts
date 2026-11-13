import { apiRequest } from './api';
import type { Slot } from '@/types';

// Vários serviços: os horários que comportam a soma das durações.
export function fetchAvailableSlots(serviceIds: string | string[], date: string) {
  const params = new URLSearchParams({ serviceIds: [serviceIds].flat().join(','), date });
  return apiRequest<{ slots: Slot[] }>(`/availability/slots?${params.toString()}`);
}

// Dias com pelo menos um horário livre (yyyy-MM-dd), a partir de `from`.
export function fetchAvailableDays(serviceIds: string[], from: string, days = 21) {
  const params = new URLSearchParams({ serviceIds: serviceIds.join(','), from, days: String(days) });
  return apiRequest<{ days: string[] }>(`/availability/days?${params.toString()}`);
}
