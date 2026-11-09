import { apiRequest } from './api';
import type { MessageTemplate, MessageTemplateKey, WhatsappState } from '@/types';

export function fetchWhatsappStatus() {
  return apiRequest<WhatsappState>('/whatsapp/status');
}

export function connectWhatsapp() {
  return apiRequest<WhatsappState>('/whatsapp/connect', { method: 'POST' });
}

export function disconnectWhatsapp() {
  return apiRequest<WhatsappState>('/whatsapp/disconnect', { method: 'POST' });
}

export function sendWhatsappTest(phone: string, text: string) {
  return apiRequest<{ ok: true }>('/whatsapp/test', { method: 'POST', body: JSON.stringify({ phone, text }) });
}

export function fetchMessageTemplates() {
  return apiRequest<{ templates: MessageTemplate[] }>('/message-templates');
}

export function saveMessageTemplate(key: MessageTemplateKey, data: { body?: string; enabled?: boolean }) {
  return apiRequest<{ templates: MessageTemplate[] }>(`/message-templates/${key}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function resetMessageTemplate(key: MessageTemplateKey) {
  return apiRequest<{ templates: MessageTemplate[] }>(`/message-templates/${key}`, { method: 'DELETE' });
}
