import { apiRequest } from './api';
import type { AdminCategory, AdminService } from '@/types';

export function fetchAdminCategories() {
  return apiRequest<{ categories: AdminCategory[] }>('/catalog/admin/categories');
}

export interface CategoryPayload {
  name: string;
  imageUrl?: string | null;
  featured?: boolean;
  sortOrder?: number;
}

export function createCategory(payload: CategoryPayload) {
  return apiRequest<{ category: AdminCategory }>('/catalog/admin/categories', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateCategory(id: string, payload: Partial<CategoryPayload> & { active?: boolean }) {
  return apiRequest<{ category: AdminCategory }>(`/catalog/admin/categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export interface ServicePayload {
  name: string;
  description?: string | null;
  durationMinutes: number;
  bufferMinutes?: number;
  priceCents?: number | null;
  imageUrl?: string | null;
  sortOrder?: number;
  returnOffsetDays?: number[];
}

export function createService(categoryId: string, payload: ServicePayload) {
  return apiRequest<{ service: AdminService }>(`/catalog/admin/categories/${categoryId}/services`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateService(
  id: string,
  payload: Partial<ServicePayload> & { categoryId?: string; active?: boolean },
) {
  return apiRequest<{ service: AdminService }>(`/catalog/admin/services/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
