import { apiRequest } from './api';
import type { Slot } from '@/types';

export function fetchAvailableSlots(serviceId: string, date: string) {
  const params = new URLSearchParams({ serviceId, date });
  return apiRequest<{ slots: Slot[] }>(`/availability/slots?${params.toString()}`);
}
