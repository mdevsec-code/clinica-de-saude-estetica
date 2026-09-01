import { apiRequest } from './api';
import type { AdminUser } from '@/types';

export function login(email: string, password: string) {
  return apiRequest<{ token: string; user: AdminUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function fetchMe() {
  return apiRequest<{ user: AdminUser }>('/auth/me');
}
