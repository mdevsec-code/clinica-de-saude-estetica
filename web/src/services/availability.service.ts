import { apiRequest } from './api';
import type { Slot } from '@/types';

// Vários serviços: os horários que comportam a soma das durações.
export function fetchAvailableSlots(serviceIds: string | string[], date: string) {
  const params = new URLSearchParams({ serviceIds: [serviceIds].flat().join(','), date });
  return apiRequest<{ slots: Slot[] }>(`/availability/slots?${params.toString()}`);
}
