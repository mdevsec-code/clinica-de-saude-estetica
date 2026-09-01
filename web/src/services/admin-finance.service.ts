import { apiRequest } from './api';
import type { Expense, ExpenseCategory } from '@/types';

export function fetchExpenses(params?: { from?: string; to?: string }) {
  const query = new URLSearchParams();
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return apiRequest<{ expenses: Expense[] }>(`/finance/expenses${suffix}`);
}

export interface ExpensePayload {
  description: string;
  category: ExpenseCategory;
  amountCents: number;
  paidAt: string;
  notes?: string | null;
}

export function createExpense(payload: ExpensePayload) {
  return apiRequest<{ expense: Expense }>('/finance/expenses', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateExpense(id: string, payload: Partial<ExpensePayload>) {
  return apiRequest<{ expense: Expense }>(`/finance/expenses/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteExpense(id: string) {
  return apiRequest<void>(`/finance/expenses/${id}`, { method: 'DELETE' });
}
