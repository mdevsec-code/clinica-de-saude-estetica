import { ref } from 'vue';
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

// <img> e links não mandam header Authorization — as rotas de arquivo
// aceitam token pela query string, mas SÓ o token de arquivo (escopo
// restrito, 1h — ver signFileToken no backend), nunca o de sessão. Fica em
// um ref para as URLs se recalcularem sozinhas quando ele for renovado.
const fileToken = ref<string | null>(null);
let fileTokenExpiresAt = 0;

// Garante um token de arquivo válido por pelo menos mais 10 minutos —
// chame antes de exibir fotos/fichas e periodicamente enquanto a tela
// estiver aberta (ver AdminPatientDetailView).
export async function ensureFileToken() {
  if (fileToken.value && Date.now() < fileTokenExpiresAt - 10 * 60_000) return;
  const { token, expiresInSeconds } = await apiRequest<{ token: string; expiresInSeconds: number }>('/auth/file-token');
  fileToken.value = token;
  fileTokenExpiresAt = Date.now() + expiresInSeconds * 1000;
}

// Chamado no logout (stores/auth.ts): o token é da conta que saiu.
export function clearFileToken() {
  fileToken.value = null;
  fileTokenExpiresAt = 0;
}

function fileUrl(path: string) {
  const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';
  return `${API_URL}${path}?token=${encodeURIComponent(fileToken.value ?? '')}`;
}

export function patientPhotoUrl(patientId: string, photoId: string): string {
  return fileUrl(`/patients/${patientId}/photos/${photoId}/file`);
}

export function notifyBirthday(patientId: string) {
  return apiRequest<{ messageId: string }>(`/patients/${patientId}/notify-birthday`, { method: 'POST' });
}

// --- Fichas de acompanhamento clínico (anamnese, bioestimulador de
// colágeno etc.) — ADMIN only no backend, ver patients.routes.ts. ---
export function fetchFichas(patientId: string) {
  return apiRequest<{ fichas: PatientFicha[] }>(`/patients/${patientId}/fichas`);
}

export interface FichaFilePayload {
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';
  base64Data: string;
  fileName: string;
}

export interface FichaPayload {
  type: string;
  fields: FichaField[];
  notes?: string | null;
  // Ficha digitalizada (upload de PDF/foto de um formulário preenchido em
  // papel) em vez de registro manual dos campos.
  file?: FichaFilePayload | null;
}

export function createFicha(patientId: string, payload: FichaPayload) {
  return apiRequest<{ ficha: PatientFicha }>(`/patients/${patientId}/fichas`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// Mesmo token de arquivo de patientPhotoUrl acima (abrir/imprimir a ficha
// digitalizada direto num link).
export function fichaFileUrl(patientId: string, fichaId: string): string {
  return fileUrl(`/patients/${patientId}/fichas/${fichaId}/file`);
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
