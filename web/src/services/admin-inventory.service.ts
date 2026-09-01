import { apiRequest } from './api';
import type { InventoryItem } from '@/types';

export function fetchInventory() {
  return apiRequest<{ items: InventoryItem[] }>('/inventory');
}

export interface InventoryItemPayload {
  name: string;
  unit?: string;
  quantity?: number;
  minQuantity?: number;
  costCents?: number | null;
}

export function createInventoryItem(payload: InventoryItemPayload) {
  return apiRequest<{ item: InventoryItem }>('/inventory', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateInventoryItem(id: string, payload: Partial<InventoryItemPayload> & { active?: boolean }) {
  return apiRequest<{ item: InventoryItem }>(`/inventory/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function adjustInventoryQuantity(id: string, delta: number) {
  return apiRequest<{ item: InventoryItem }>(`/inventory/${id}/adjust`, {
    method: 'POST',
    body: JSON.stringify({ delta }),
  });
}
