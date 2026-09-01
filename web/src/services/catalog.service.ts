import { apiRequest } from './api';
import type { ServiceCategory } from '@/types';

export function fetchCategories() {
  return apiRequest<{ categories: ServiceCategory[] }>('/catalog/categories');
}
