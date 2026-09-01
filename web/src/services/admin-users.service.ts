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
