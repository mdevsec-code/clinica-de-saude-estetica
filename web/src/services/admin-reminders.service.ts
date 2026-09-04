import { apiRequest } from './api';
import type { ReturnReminderStatus, UnifiedReminder } from '@/types';

export function fetchReminders(days = 30) {
  return apiRequest<{ reminders: UnifiedReminder[] }>(`/reminders?days=${days}`);
}

export function setReminderStatus(id: string, status: Extract<ReturnReminderStatus, 'DONE' | 'DISMISSED'>) {
  return apiRequest<{ reminder: unknown }>(`/reminders/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function notifyReturnReminder(id: string) {
  return apiRequest<{ messageId: string }>(`/reminders/${id}/notify-whatsapp`, { method: 'POST' });
}
