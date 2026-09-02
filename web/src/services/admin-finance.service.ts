import { apiRequest } from './api';
import type {
  BankTransaction,
  DailyRevenueHistory,
  DreReport,
  Expense,
  ExpenseCategory,
  ExpenseStatus,
  TodaySummary,
} from '@/types';

export function fetchExpenses(params?: { from?: string; to?: string; status?: ExpenseStatus }) {
  const query = new URLSearchParams();
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  if (params?.status) query.set('status', params.status);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return apiRequest<{ expenses: Expense[] }>(`/finance/expenses${suffix}`);
}

export interface ExpensePayload {
  description: string;
  category: ExpenseCategory;
  amountCents: number;
  status: ExpenseStatus;
  dueAt?: string | null;
  paidAt?: string | null;
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

export function markExpensePaid(id: string, paidAt: string) {
  return apiRequest<{ expense: Expense }>(`/finance/expenses/${id}/pay`, {
    method: 'POST',
    body: JSON.stringify({ paidAt }),
  });
}

export function deleteExpense(id: string) {
  return apiRequest<void>(`/finance/expenses/${id}`, { method: 'DELETE' });
}

export function fetchTodaySummary() {
  return apiRequest<TodaySummary>('/finance/today-summary');
}

export function fetchDailyRevenueHistory(days = 30) {
  return apiRequest<DailyRevenueHistory>(`/finance/revenue-daily?days=${days}`);
}

export function fetchDre(from: string, to: string) {
  return apiRequest<DreReport>(`/finance/dre?from=${from}&to=${to}`);
}

export function importBankStatement(content: string) {
  return apiRequest<{ imported: number; skipped: number; total: number }>('/finance/bank/import', {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

export function fetchBankTransactions(status?: BankTransaction['status']) {
  const suffix = status ? `?status=${status}` : '';
  return apiRequest<{ transactions: BankTransaction[] }>(`/finance/bank/transactions${suffix}`);
}

export function fetchMatchSuggestions(bankTransactionId: string) {
  return apiRequest<{ suggestions: Expense[] }>(`/finance/bank/transactions/${bankTransactionId}/suggestions`);
}

export function matchBankTransaction(bankTransactionId: string, expenseId: string) {
  return apiRequest<{ transaction: BankTransaction }>(`/finance/bank/transactions/${bankTransactionId}/match`, {
    method: 'POST',
    body: JSON.stringify({ expenseId }),
  });
}

export function unmatchBankTransaction(bankTransactionId: string) {
  return apiRequest<{ transaction: BankTransaction }>(`/finance/bank/transactions/${bankTransactionId}/unmatch`, {
    method: 'POST',
  });
}

export function ignoreBankTransaction(bankTransactionId: string) {
  return apiRequest<{ transaction: BankTransaction }>(`/finance/bank/transactions/${bankTransactionId}/ignore`, {
    method: 'POST',
  });
}
