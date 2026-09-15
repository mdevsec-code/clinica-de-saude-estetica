import { apiRequest } from './api';
import type { AdminAccount, UserRole } from '@/types';

export function fetchUsers() {
  return apiRequest<{ users: AdminAccount[] }>('/auth/users');
}

export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

export function createUser(payload: CreateUserPayload) {
  return apiRequest<{ user: AdminAccount }>('/auth/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function setUserActive(id: string, active: boolean) {
  return apiRequest<{ user: AdminAccount }>(`/auth/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ active }),
  });
}

export interface UpdateUserPayload {
  name: string;
  email: string;
  role: UserRole;
}

export function updateUser(id: string, payload: UpdateUserPayload) {
  return apiRequest<{ user: AdminAccount }>(`/auth/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function resetUserPassword(id: string, password: string) {
  return apiRequest<void>(`/auth/users/${id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}
