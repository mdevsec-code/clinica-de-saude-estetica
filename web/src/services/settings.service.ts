import { apiRequest } from './api';
import type { PublicSettings } from '@/types';

export function fetchPublicSettings() {
  return apiRequest<PublicSettings>('/settings/public');
}

export function whatsappLink(whatsapp: string, message: string) {
  const digitsOnly = whatsapp.replace(/\D/g, '');
  return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`;
}

export function instagramLink(handle: string) {
  const username = handle.replace(/^@/, '');
  return `https://instagram.com/${username}`;
}
