import { apiRequest } from './api';
import type { FichaField, PatientDetail, PatientFicha, PatientListItem, PatientPhotoCategory } from '@/types';

export function fetchPatients(search?: string) {
  const qs = search ? `?search=${encodeURIComponent(search)}` : '';
  return apiRequest<{ patients: PatientListItem[] }>(`/patients${qs}`);
}

export function fetchPatient(id: string) {
  return apiRequest<{ patient: PatientDetail; restricted: boolean }>(`/patients/${id}`);
}

export interface PatientPayload {
  name: string;
  whatsapp: string;
  phone?: string | null;
  email?: string | null;
  birthDate?: string | null;
  notes?: string | null;
}

export function createPatient(payload: PatientPayload) {
  return apiRequest<{ patient: PatientListItem }>('/patients', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updatePatient(id: string, payload: Partial<PatientPayload>) {
  return apiRequest<{ patient: PatientListItem }>(`/patients/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export interface AddPhotoPayload {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  base64Data: string;
  category: PatientPhotoCategory;
  notes?: string | null;
  takenAt: string;
  procedureRecordId?: string | null;
}

export function addPatientPhoto(patientId: string, payload: AddPhotoPayload) {
  return apiRequest<{ photo: { id: string } }>(`/patients/${patientId}/photos`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function removePatientPhoto(patientId: string, photoId: string) {
  return apiRequest<void>(`/patients/${patientId}/photos/${photoId}`, { method: 'DELETE' });
}

// <img> não manda header Authorization — a rota aceita o token também via
// query string só para servir arquivo (ver requireAuthFromHeaderOrQuery no
// backend). Nunca usar esse padrão de token-na-URL em outra chamada.
export function patientPhotoUrl(patientId: string, photoId: string): string {
  const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';
  const token = localStorage.getItem('noely_admin_token') ?? '';
  return `${API_URL}/patients/${patientId}/photos/${photoId}/file?token=${encodeURIComponent(token)}`;
}

export function notifyBirthday(patientId: string) {
  return apiRequest<{ messageId: string }>(`/patients/${patientId}/notify-birthday`, { method: 'POST' });
}

// --- Fichas de acompanhamento clínico (anamnese, bioestimulador de
// colágeno etc.) — ADMIN only no backend, ver patients.routes.ts. ---
export function fetchFichas(patientId: string) {
  return apiRequest<{ fichas: PatientFicha[] }>(`/patients/${patientId}/fichas`);
}

export interface FichaPayload {
  type: string;
  fields: FichaField[];
  notes?: string | null;
}

export function createFicha(patientId: string, payload: FichaPayload) {
  return apiRequest<{ ficha: PatientFicha }>(`/patients/${patientId}/fichas`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateFicha(patientId: string, fichaId: string, payload: Partial<FichaPayload>) {
  return apiRequest<{ ficha: PatientFicha }>(`/patients/${patientId}/fichas/${fichaId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteFicha(patientId: string, fichaId: string) {
  return apiRequest<void>(`/patients/${patientId}/fichas/${fichaId}`, { method: 'DELETE' });
}
