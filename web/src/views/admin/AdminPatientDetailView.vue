<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError } from '@/services/api';
import {
  addPatientPhoto,
  createFicha as createFichaApi,
  deleteFicha as deleteFichaApi,
  fetchFichas,
  fetchPatient,
  notifyBirthday,
  patientPhotoUrl,
  removePatientPhoto,
  updatePatient,
} from '@/services/admin-patients.service';
import { notifyReturnReminder, setReminderStatus } from '@/services/admin-reminders.service';
import { useAuthStore } from '@/stores/auth';
import type { FichaField, PatientDetail, PatientFicha, PatientPhotoCategory } from '@/types';
import LoadingState from '@/components/LoadingState.vue';
import EmptyState from '@/components/EmptyState.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const patient = ref<PatientDetail | null>(null);
const restricted = ref(false);
const loading = ref(true);
const error = ref<string | null>(null);
const tab = ref<'overview' | 'history' | 'photos' | 'financial' | 'fichas'>('overview');

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const { patient: data, restricted: r } = await fetchPatient(route.params.id as string);
    patient.value = data;
    restricted.value = r;
    // Fichas são ADMIN-only no backend (dado clínico é o mais sensível do
    // módulo, ver patients.routes.ts) — nem tenta buscar pra quem está numa
    // sessão restrita (RECEPTION), evita uma requisição fadada a 403.
    if (!r) await loadFichas();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      router.push({ name: 'admin-login' });
      return;
    }
    error.value = err instanceof ApiError ? err.message : 'Não foi possível carregar a ficha.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR');
}

function formatCurrency(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const statusLabels: Record<string, string> = {
  CONFIRMED: 'Confirmado',
  CANCELLED: 'Cancelado',
  COMPLETED: 'Concluído',
  NO_SHOW: 'Faltou',
};

// --- Editar dados cadastrais ---
const editing = ref(false);
const editForm = reactive({ name: '', whatsapp: '', phone: '', email: '', birthDate: '', notes: '' });
const savingEdit = ref(false);
const editError = ref<string | null>(null);

function startEdit() {
  if (!patient.value) return;
  editForm.name = patient.value.name;
  editForm.whatsapp = patient.value.whatsapp;
  editForm.phone = patient.value.phone ?? '';
  editForm.email = patient.value.email ?? '';
  editForm.birthDate = patient.value.birthDate ? patient.value.birthDate.slice(0, 10) : '';
  editForm.notes = patient.value.notes ?? '';
  editing.value = true;
}

async function saveEdit() {
  if (!patient.value) return;
  savingEdit.value = true;
  editError.value = null;
  try {
    await updatePatient(patient.value.id, {
      name: editForm.name.trim(),
      whatsapp: editForm.whatsapp.trim(),
      phone: editForm.phone.trim() || null,
      email: editForm.email.trim() || null,
      birthDate: editForm.birthDate || null,
      notes: editForm.notes.trim() || null,
    });
    editing.value = false;
    await load();
  } catch (err) {
    editError.value = err instanceof ApiError ? err.message : 'Não foi possível salvar.';
  } finally {
    savingEdit.value = false;
  }
}

// --- Retornos: marcar concluído/dispensar/notificar ---
const reminderBusyId = ref<string | null>(null);
const reminderMessage = ref<string | null>(null);

async function actOnReminder(id: string, action: 'DONE' | 'DISMISSED' | 'NOTIFY') {
  reminderBusyId.value = id;
  reminderMessage.value = null;
  try {
    if (action === 'NOTIFY') {
      await notifyReturnReminder(id);
      reminderMessage.value = 'Lembrete enviado pelo WhatsApp.';
    } else {
      await setReminderStatus(id, action);
    }
    await load();
  } catch (err) {
    reminderMessage.value = err instanceof ApiError ? err.message : 'Não foi possível concluir a ação.';
  } finally {
    reminderBusyId.value = null;
  }
}

const birthdayBusy = ref(false);
const birthdayMessage = ref<string | null>(null);
async function sendBirthday() {
  if (!patient.value) return;
  birthdayBusy.value = true;
  birthdayMessage.value = null;
  try {
    await notifyBirthday(patient.value.id);
    birthdayMessage.value = 'Mensagem de aniversário enviada.';
  } catch (err) {
    birthdayMessage.value = err instanceof ApiError ? err.message : 'Não foi possível enviar.';
  } finally {
    birthdayBusy.value = false;
  }
}

// --- Galeria de fotos ---
const photoCategoryLabels: Record<PatientPhotoCategory, string> = {
  BEFORE: 'Antes',
  AFTER: 'Depois',
  EVOLUTION: 'Evolução',
  OTHER: 'Outra',
};
const photoFilter = ref<PatientPhotoCategory | 'ALL'>('ALL');
const filteredPhotos = computed(() => {
  if (!patient.value) return [];
  return photoFilter.value === 'ALL' ? patient.value.photos : patient.value.photos.filter((p) => p.category === photoFilter.value);
});

const uploadForm = reactive({ category: 'BEFORE' as PatientPhotoCategory, takenAt: new Date().toISOString().slice(0, 10), notes: '' });
const uploadBusy = ref(false);
const uploadError = ref<string | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

function fileToBase64(file: File): Promise<{ mime: string; data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [meta, data] = result.split(',');
      const mime = meta.match(/data:(.*);base64/)?.[1] ?? file.type;
      resolve({ mime, data });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function onFileSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file || !patient.value) return;

  uploadBusy.value = true;
  uploadError.value = null;
  try {
    const { mime, data } = await fileToBase64(file);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
      throw new Error('Use uma imagem JPEG, PNG ou WebP.');
    }
    await addPatientPhoto(patient.value.id, {
      mimeType: mime as 'image/jpeg' | 'image/png' | 'image/webp',
      base64Data: data,
      category: uploadForm.category,
      notes: uploadForm.notes.trim() || null,
      takenAt: uploadForm.takenAt,
    });
    uploadForm.notes = '';
    await load();
  } catch (err) {
    uploadError.value = err instanceof Error ? err.message : 'Não foi possível enviar a foto.';
  } finally {
    uploadBusy.value = false;
    if (fileInput.value) fileInput.value.value = '';
  }
}

async function deletePhoto(photoId: string) {
  if (!patient.value) return;
  await removePatientPhoto(patient.value.id, photoId).catch(() => undefined);
  await load();
}

// --- Comparação visual: escolher 2 fotos e ver lado a lado ---
const compareIds = ref<string[]>([]);
function toggleCompare(photoId: string) {
  if (compareIds.value.includes(photoId)) {
    compareIds.value = compareIds.value.filter((id) => id !== photoId);
    return;
  }
  compareIds.value = compareIds.value.length >= 2 ? [compareIds.value[1], photoId] : [...compareIds.value, photoId];
}
const comparePhotos = computed(() => {
  if (!patient.value) return [];
  return compareIds.value.map((id) => patient.value!.photos.find((p) => p.id === id)).filter(Boolean);
});

// --- Fichas de acompanhamento clínico ---
// Modelos de partida por tipo — SÓ preenchem o rascunho inicial (o admin
// edita/apaga campos livremente antes de salvar). Ainda não é o formulário
// real que a Noely usa em papel: ela vai passar as fichas de verdade depois
// e a gente redesenha os campos junto (rótulos certos, obrigatoriedade,
// LGPD) — isso aqui existe pra já ter onde registrar hoje, sem esperar esse
// redesenho pra começar a digitalizar o que ela já preenche à mão.
const FICHA_PRESETS: Record<string, FichaField[]> = {
  Anamnese: [
    { label: 'Alergias', value: '' },
    { label: 'Medicações em uso', value: '' },
    { label: 'Condições de saúde preexistentes', value: '' },
    { label: 'Cirurgias anteriores', value: '' },
    { label: 'Gestante / lactante', value: '' },
    { label: 'Observações gerais', value: '' },
  ],
  'Bioestimulador de Colágeno': [
    { label: 'Produto utilizado', value: '' },
    { label: 'Lote', value: '' },
    { label: 'Área tratada', value: '' },
    { label: 'Quantidade aplicada', value: '' },
    { label: 'Reações / observações', value: '' },
  ],
};
const fichaPresetNames = Object.keys(FICHA_PRESETS);

const fichas = ref<PatientFicha[]>([]);
const fichasLoading = ref(false);
const fichasError = ref<string | null>(null);

async function loadFichas() {
  if (!patient.value && !route.params.id) return;
  fichasLoading.value = true;
  fichasError.value = null;
  try {
    const { fichas: data } = await fetchFichas(route.params.id as string);
    fichas.value = data;
  } catch (err) {
    fichasError.value = err instanceof ApiError ? err.message : 'Não foi possível carregar as fichas.';
  } finally {
    fichasLoading.value = false;
  }
}

const showFichaForm = ref(false);
const fichaForm = reactive<{ type: string; customType: string; fields: FichaField[]; notes: string }>({
  type: '',
  customType: '',
  fields: [],
  notes: '',
});
const savingFicha = ref(false);
const fichaFormError = ref<string | null>(null);

function startNewFicha(presetName: string | null) {
  showFichaForm.value = true;
  fichaFormError.value = null;
  if (presetName) {
    fichaForm.type = presetName;
    fichaForm.customType = '';
    fichaForm.fields = FICHA_PRESETS[presetName].map((f) => ({ ...f }));
  } else {
    fichaForm.type = '';
    fichaForm.customType = '';
    fichaForm.fields = [{ label: '', value: '' }];
  }
  fichaForm.notes = '';
}

function addFichaField() {
  fichaForm.fields.push({ label: '', value: '' });
}

function removeFichaField(index: number) {
  fichaForm.fields.splice(index, 1);
}

async function saveFicha() {
  if (!patient.value) return;
  const type = (fichaForm.type === '' ? fichaForm.customType : fichaForm.type).trim();
  const fields = fichaForm.fields.filter((f) => f.label.trim());
  if (!type || !fields.length) {
    fichaFormError.value = 'Informe o tipo de ficha e pelo menos um campo preenchido.';
    return;
  }
  savingFicha.value = true;
  fichaFormError.value = null;
  try {
    const { ficha } = await createFichaApi(patient.value.id, { type, fields, notes: fichaForm.notes.trim() || null });
    fichas.value.unshift(ficha);
    showFichaForm.value = false;
  } catch (err) {
    fichaFormError.value = err instanceof ApiError ? err.message : 'Não foi possível salvar a ficha.';
  } finally {
    savingFicha.value = false;
  }
}

async function removeFicha(fichaId: string) {
  if (!patient.value) return;
  await deleteFichaApi(patient.value.id, fichaId).catch(() => undefined);
  fichas.value = fichas.value.filter((f) => f.id !== fichaId);
}
</script>

<template>
  <div class="patient-detail">
    <button type="button" class="admin-link-btn patient-detail__back" @click="router.push({ name: 'admin-patients' })">
      ← Voltar para pacientes
    </button>

    <Transition name="fade-swap">
      <LoadingState v-if="loading" key="loading" label="Carregando ficha…" />
      <EmptyState v-else-if="error" key="error" title="Algo deu errado" :description="error" action-label="Tentar novamente" @action="load" />

      <div v-else-if="patient" key="content">
        <div class="admin-card patient-detail__header">
          <span class="patient-detail__avatar">
            <img v-if="patient.profilePhotoUrl" :src="patient.profilePhotoUrl" :alt="patient.name" />
            <span v-else>{{ patient.name.charAt(0) }}</span>
          </span>
          <div class="patient-detail__headline">
            <h1>{{ patient.name }}</h1>
            <p>{{ patient.phone || patient.whatsapp }} · {{ patient.email || 'sem e-mail' }} · Nascimento: {{ formatDate(patient.birthDate) }}</p>
            <span v-if="restricted" class="admin-badge admin-badge--warning">Acesso restrito — notas e fotos ocultas para este perfil</span>
          </div>
          <div class="patient-detail__actions">
            <button type="button" class="button button--ghost" @click="startEdit">Editar dados</button>
            <button
              v-if="auth.user?.role === 'ADMIN' && patient.birthDate"
              type="button"
              class="button button--ghost"
              :disabled="birthdayBusy"
              @click="sendBirthday"
            >
              {{ birthdayBusy ? 'Enviando…' : '🎂 Enviar felicitação' }}
            </button>
          </div>
        </div>
        <p v-if="birthdayMessage" class="patient-detail__notice">{{ birthdayMessage }}</p>

        <form v-if="editing" class="admin-card patient-detail__edit-form" @submit.prevent="saveEdit">
          <h2>Editar dados cadastrais</h2>
          <div class="admin-form-row">
            <label class="admin-field">Nome<input v-model="editForm.name" type="text" required /></label>
            <label class="admin-field admin-field--small">WhatsApp<input v-model="editForm.whatsapp" type="text" required /></label>
            <label class="admin-field admin-field--small">Telefone<input v-model="editForm.phone" type="text" /></label>
            <label class="admin-field">E-mail<input v-model="editForm.email" type="email" /></label>
            <label class="admin-field admin-field--small">Nascimento<input v-model="editForm.birthDate" type="date" /></label>
          </div>
          <label class="admin-field">
            Observações
            <textarea v-model="editForm.notes" rows="3" placeholder="Notas clínicas, preferências, alergias…" />
          </label>
          <div class="patient-detail__edit-actions">
            <button type="button" class="button button--ghost" @click="editing = false">Cancelar</button>
            <button type="submit" class="button button--primary" :disabled="savingEdit">{{ savingEdit ? 'Salvando…' : 'Salvar' }}</button>
          </div>
          <p v-if="editError" class="admin-error">{{ editError }}</p>
        </form>

        <nav class="patient-detail__tabs">
          <button type="button" :class="{ 'is-active': tab === 'overview' }" @click="tab = 'overview'">Visão geral</button>
          <button type="button" :class="{ 'is-active': tab === 'history' }" @click="tab = 'history'">Histórico</button>
          <button v-if="!restricted" type="button" :class="{ 'is-active': tab === 'photos' }" @click="tab = 'photos'">
            Fotos ({{ patient.photos.length }})
          </button>
          <button v-if="!restricted" type="button" :class="{ 'is-active': tab === 'fichas' }" @click="tab = 'fichas'">
            Fichas ({{ fichas.length }})
          </button>
          <button type="button" :class="{ 'is-active': tab === 'financial' }" @click="tab = 'financial'">Financeiro</button>
        </nav>

        <!-- Visão geral: procedimentos + retornos -->
        <div v-if="tab === 'overview'" class="patient-detail__panel">
          <p v-if="!patient.notes && !restricted" class="patient-detail__empty-notes">Nenhuma observação registrada ainda.</p>
          <p v-else-if="patient.notes" class="admin-card patient-detail__notes">{{ patient.notes }}</p>

          <h2 class="patient-detail__section-title">Procedimentos e retornos</h2>
          <p v-if="reminderMessage" class="patient-detail__notice">{{ reminderMessage }}</p>
          <EmptyState v-if="!patient.procedureRecords.length" title="Nenhum procedimento concluído ainda." />
          <ul v-else class="patient-detail__procedures">
            <li v-for="proc in patient.procedureRecords" :key="proc.id" class="admin-card">
              <div class="patient-detail__procedure-head">
                <strong>{{ proc.serviceName }}</strong>
                <span>{{ formatDate(proc.performedAt) }}</span>
              </div>
              <ul v-if="proc.returnReminders.length" class="patient-detail__returns">
                <li v-for="r in proc.returnReminders" :key="r.id" :class="`is-${r.status.toLowerCase()}`">
                  <span>Retorno em {{ formatDate(r.dueAt) }} (+{{ r.offsetDays }}d)</span>
                  <span class="admin-badge" :class="`admin-badge--${r.status === 'PENDING' ? 'warning' : 'ok'}`">
                    {{ { PENDING: 'Pendente', NOTIFIED: 'Avisado', DONE: 'Concluído', DISMISSED: 'Dispensado' }[r.status] }}
                  </span>
                  <span v-if="r.status === 'PENDING'" class="patient-detail__return-actions">
                    <button type="button" class="admin-link-btn" :disabled="reminderBusyId === r.id" @click="actOnReminder(r.id, 'DONE')">Concluir</button>
                    <button
                      v-if="auth.user?.role === 'ADMIN'"
                      type="button"
                      class="admin-link-btn"
                      :disabled="reminderBusyId === r.id"
                      @click="actOnReminder(r.id, 'NOTIFY')"
                    >
                      Enviar WhatsApp
                    </button>
                    <button type="button" class="admin-link-btn" :disabled="reminderBusyId === r.id" @click="actOnReminder(r.id, 'DISMISSED')">Dispensar</button>
                  </span>
                </li>
              </ul>
            </li>
          </ul>
        </div>

        <!-- Histórico de atendimentos -->
        <div v-else-if="tab === 'history'" class="patient-detail__panel">
          <EmptyState v-if="!patient.appointments.length" title="Nenhum atendimento registrado ainda." />
          <ul v-else class="patient-detail__appointments">
            <li v-for="a in patient.appointments" :key="a.id" class="admin-card">
              <div>
                <strong>{{ a.service.name }}</strong>
                <span class="patient-detail__appt-date">{{ formatDateTime(a.startAt) }}</span>
              </div>
              <span class="admin-badge" :class="{ 'admin-badge--ok': a.status === 'COMPLETED', 'admin-badge--warning': a.status === 'NO_SHOW' }">
                {{ statusLabels[a.status] }}
              </span>
            </li>
          </ul>
        </div>

        <!-- Galeria de fotos -->
        <div v-else-if="tab === 'photos' && !restricted" class="patient-detail__panel">
          <form class="admin-card patient-detail__upload" @submit.prevent>
            <h2>Adicionar foto</h2>
            <div class="admin-form-row">
              <label class="admin-field admin-field--small">
                Categoria
                <select v-model="uploadForm.category">
                  <option value="BEFORE">Antes</option>
                  <option value="AFTER">Depois</option>
                  <option value="EVOLUTION">Evolução</option>
                  <option value="OTHER">Outra</option>
                </select>
              </label>
              <label class="admin-field admin-field--small">
                Data
                <input v-model="uploadForm.takenAt" type="date" />
              </label>
              <label class="admin-field">
                Observação
                <input v-model="uploadForm.notes" type="text" placeholder="Opcional" />
              </label>
              <label class="button button--primary patient-detail__upload-btn">
                {{ uploadBusy ? 'Enviando…' : 'Escolher foto' }}
                <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" hidden :disabled="uploadBusy" @change="onFileSelected" />
              </label>
            </div>
            <p v-if="uploadError" class="admin-error">{{ uploadError }}</p>
          </form>

          <div class="patient-detail__photo-filters">
            <button type="button" :class="{ 'is-active': photoFilter === 'ALL' }" @click="photoFilter = 'ALL'">Todas</button>
            <button
              v-for="cat in (['BEFORE', 'AFTER', 'EVOLUTION', 'OTHER'] as const)"
              :key="cat"
              type="button"
              :class="{ 'is-active': photoFilter === cat }"
              @click="photoFilter = cat"
            >
              {{ photoCategoryLabels[cat] }}
            </button>
            <span v-if="compareIds.length" class="patient-detail__compare-hint">Comparando {{ compareIds.length }}/2 — clique em outra foto para trocar</span>
          </div>

          <div v-if="comparePhotos.length === 2" class="patient-detail__compare">
            <div v-for="p in comparePhotos" :key="p!.id" class="patient-detail__compare-item">
              <img :src="patientPhotoUrl(patient.id, p!.id)" :alt="photoCategoryLabels[p!.category]" />
              <span>{{ photoCategoryLabels[p!.category] }} · {{ formatDate(p!.takenAt) }}</span>
            </div>
          </div>

          <EmptyState v-if="!filteredPhotos.length" title="Nenhuma foto nessa categoria ainda." />
          <div v-else class="patient-detail__gallery">
            <div
              v-for="photo in filteredPhotos"
              :key="photo.id"
              class="patient-detail__photo"
              :class="{ 'is-selected': compareIds.includes(photo.id) }"
              @click="toggleCompare(photo.id)"
            >
              <img :src="patientPhotoUrl(patient.id, photo.id)" :alt="photoCategoryLabels[photo.category]" loading="lazy" />
              <div class="patient-detail__photo-meta">
                <span class="admin-badge">{{ photoCategoryLabels[photo.category] }}</span>
                <span>{{ formatDate(photo.takenAt) }}</span>
                <button type="button" class="patient-detail__photo-delete" title="Remover" @click.stop="deletePhoto(photo.id)">✕</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Fichas de acompanhamento clínico -->
        <div v-else-if="tab === 'fichas' && !restricted" class="patient-detail__panel">
          <p class="patient-detail__fichas-intro">
            Fichas de anamnese, protocolos por procedimento etc. — os campos abaixo são um ponto de partida editável;
            o formulário definitivo de cada tipo ainda vai ser desenhado a partir das fichas reais que a Noely usa.
          </p>

          <div class="patient-detail__ficha-presets">
            <button
              v-for="name in fichaPresetNames"
              :key="name"
              type="button"
              class="button button--ghost"
              @click="startNewFicha(name)"
            >
              + Ficha de {{ name }}
            </button>
            <button type="button" class="button button--ghost" @click="startNewFicha(null)">+ Outro tipo de ficha</button>
          </div>

          <form v-if="showFichaForm" class="admin-card patient-detail__ficha-form" @submit.prevent="saveFicha">
            <label v-if="!fichaForm.type" class="admin-field">
              Tipo de ficha
              <input v-model="fichaForm.customType" type="text" required placeholder="Ex.: Ficha de Peeling Químico" />
            </label>
            <p v-else class="patient-detail__ficha-form-type">Tipo: <strong>{{ fichaForm.type }}</strong></p>

            <div class="patient-detail__ficha-fields">
              <div v-for="(field, i) in fichaForm.fields" :key="i" class="patient-detail__ficha-field-row">
                <input v-model="field.label" type="text" placeholder="Nome do campo" class="patient-detail__ficha-field-label" />
                <input v-model="field.value" type="text" placeholder="Resposta / valor" />
                <button type="button" class="patient-detail__ficha-field-remove" title="Remover campo" @click="removeFichaField(i)">✕</button>
              </div>
              <button type="button" class="admin-link-btn" @click="addFichaField">+ Adicionar campo</button>
            </div>

            <label class="admin-field">
              Observações
              <textarea v-model="fichaForm.notes" rows="3" placeholder="Observações gerais sobre esta ficha…" />
            </label>

            <p v-if="fichaFormError" class="admin-error">{{ fichaFormError }}</p>
            <div class="patient-detail__edit-actions">
              <button type="button" class="button button--ghost" @click="showFichaForm = false">Cancelar</button>
              <button type="submit" class="button button--primary" :disabled="savingFicha">{{ savingFicha ? 'Salvando…' : 'Salvar ficha' }}</button>
            </div>
          </form>

          <p v-if="fichasError" class="admin-error">{{ fichasError }}</p>
          <LoadingState v-if="fichasLoading" label="Carregando fichas…" />
          <EmptyState v-else-if="!fichas.length" title="Nenhuma ficha registrada ainda." />
          <ul v-else class="patient-detail__ficha-list">
            <li v-for="f in fichas" :key="f.id" class="admin-card">
              <div class="patient-detail__ficha-head">
                <strong>{{ f.type }}</strong>
                <span>{{ formatDate(f.createdAt) }}</span>
                <button type="button" class="patient-detail__photo-delete patient-detail__ficha-delete" title="Remover" @click="removeFicha(f.id)">✕</button>
              </div>
              <dl class="patient-detail__ficha-data">
                <template v-for="field in f.fields" :key="field.label">
                  <dt>{{ field.label }}</dt>
                  <dd>{{ field.value || '—' }}</dd>
                </template>
              </dl>
              <p v-if="f.notes" class="patient-detail__ficha-notes">{{ f.notes }}</p>
            </li>
          </ul>
        </div>

        <!-- Financeiro -->
        <div v-else-if="tab === 'financial'" class="patient-detail__panel">
          <div class="admin-card patient-detail__total">
            <span>Total gasto na clínica</span>
            <strong>{{ formatCurrency(patient.financial.totalSpentCents) }}</strong>
          </div>
          <EmptyState v-if="!patient.financial.records.length" title="Nenhum atendimento concluído com valor registrado ainda." />
          <ul v-else class="patient-detail__financial-list">
            <li v-for="r in patient.financial.records" :key="r.appointmentId" class="admin-card">
              <span>{{ r.serviceName }}</span>
              <span>{{ formatDate(r.date) }}</span>
              <strong>{{ formatCurrency(r.amountCents) }}</strong>
            </li>
          </ul>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.patient-detail__back {
  margin-bottom: var(--space-4);
}

.admin-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-5);
}

.admin-link-btn {
  background: none;
  border: none;
  color: var(--color-rose-700);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  padding: 0;
}

.admin-link-btn:hover {
  text-decoration: underline;
}

.admin-error {
  color: var(--color-danger);
  font-size: 0.85rem;
}

.admin-badge {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 9px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-muted);
  color: var(--color-ink-muted);
}

.admin-badge--warning {
  background: #fce4de;
  color: var(--color-danger);
}

.admin-badge--ok {
  background: #dff3e6;
  color: #1f7a43;
}

.patient-detail__header {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-2);
}

.patient-detail__avatar {
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  overflow: hidden;
  background: linear-gradient(135deg, var(--color-rose-100), var(--color-rose-300));
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1.4rem;
  color: var(--color-rose-700);
}

.patient-detail__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.patient-detail__headline {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.patient-detail__headline p {
  color: var(--color-ink-muted);
  font-size: 0.9rem;
}

.patient-detail__actions {
  display: flex;
  gap: var(--space-2);
  flex-shrink: 0;
}

.patient-detail__notice {
  margin: var(--space-2) 0;
  font-size: 0.85rem;
  color: var(--color-rose-700);
  font-weight: 600;
}

.patient-detail__edit-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.patient-detail__edit-form textarea {
  font-family: inherit;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  resize: vertical;
}

.patient-detail__edit-actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}

.admin-form-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-3);
}

.admin-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-ink);
  flex: 1;
  min-width: 160px;
}

.admin-field--small {
  flex: 0 0 150px;
  min-width: 120px;
}

.admin-field input,
.admin-field select {
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 400;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
}

.patient-detail__tabs {
  display: flex;
  gap: var(--space-2);
  margin: var(--space-5) 0 var(--space-4);
  border-bottom: 1px solid var(--color-border);
  overflow-x: auto;
}

.patient-detail__tabs button {
  background: none;
  border: none;
  padding: 10px 4px;
  margin-right: var(--space-4);
  font-weight: 600;
  color: var(--color-ink-muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  white-space: nowrap;
}

.patient-detail__tabs button.is-active {
  color: var(--color-rose-700);
  border-bottom-color: var(--color-rose-700);
}

.patient-detail__empty-notes {
  color: var(--color-ink-muted);
  font-size: 0.9rem;
  margin-bottom: var(--space-4);
}

.patient-detail__notes {
  margin-bottom: var(--space-5);
  white-space: pre-wrap;
  color: var(--color-ink);
}

.patient-detail__section-title {
  font-size: 1.05rem;
  margin-bottom: var(--space-3);
}

.patient-detail__procedures,
.patient-detail__appointments,
.patient-detail__financial-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.patient-detail__procedure-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: var(--space-3);
  color: var(--color-ink);
}

.patient-detail__returns {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.patient-detail__returns li {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  font-size: 0.85rem;
  padding: var(--space-2) 0;
  border-top: 1px dashed var(--color-border);
}

.patient-detail__return-actions {
  display: flex;
  gap: var(--space-3);
  margin-left: auto;
}

.patient-detail__appointments li {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.patient-detail__appt-date {
  display: block;
  font-size: 0.8rem;
  color: var(--color-ink-muted);
}

.patient-detail__upload {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.patient-detail__upload h2 {
  font-size: 1.1rem;
}

.patient-detail__upload-btn {
  cursor: pointer;
}

.patient-detail__photo-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.patient-detail__photo-filters button {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  padding: 6px 14px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-ink-muted);
  cursor: pointer;
}

.patient-detail__photo-filters button.is-active {
  background: var(--color-rose-700);
  border-color: var(--color-rose-700);
  color: #fff;
}

.patient-detail__compare-hint {
  font-size: 0.8rem;
  color: var(--color-ink-muted);
}

.patient-detail__compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  margin-bottom: var(--space-5);
}

.patient-detail__compare-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.patient-detail__compare-item img {
  width: 100%;
  border-radius: var(--radius-md);
  aspect-ratio: 1;
  object-fit: cover;
}

.patient-detail__compare-item span {
  font-size: 0.8rem;
  color: var(--color-ink-muted);
  text-align: center;
}

.patient-detail__gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--space-3);
}

.patient-detail__photo {
  position: relative;
  border-radius: var(--radius-md);
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  aspect-ratio: 1;
}

.patient-detail__photo.is-selected {
  border-color: var(--color-rose-700);
}

.patient-detail__photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.patient-detail__photo-meta {
  position: absolute;
  inset: auto 0 0 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.65), transparent);
  color: #fff;
  font-size: 0.72rem;
}

.patient-detail__photo-delete {
  margin-left: auto;
  background: none;
  border: none;
  color: #fff;
  cursor: pointer;
  font-size: 0.9rem;
}

.patient-detail__fichas-intro {
  color: var(--color-ink-muted);
  font-size: 0.85rem;
  max-width: 60ch;
  margin-bottom: var(--space-4);
}

.patient-detail__ficha-presets {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.patient-detail__ficha-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-bottom: var(--space-5);
}

.patient-detail__ficha-form-type {
  font-size: 0.9rem;
  color: var(--color-ink);
}

.patient-detail__ficha-form textarea {
  font-family: inherit;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  resize: vertical;
}

.patient-detail__ficha-fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.patient-detail__ficha-field-row {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.patient-detail__ficha-field-row input {
  flex: 1;
  min-width: 0;
  font-family: inherit;
  font-size: 0.9rem;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
}

.patient-detail__ficha-field-label {
  flex: 0 0 38%;
  font-weight: 600;
}

.patient-detail__ficha-field-remove {
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--color-ink-soft);
  cursor: pointer;
  font-size: 0.9rem;
  padding: 4px;
}

.patient-detail__ficha-field-remove:hover {
  color: var(--color-danger);
}

.patient-detail__ficha-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.patient-detail__ficha-head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
  color: var(--color-ink);
}

.patient-detail__ficha-head span {
  font-size: 0.8rem;
  color: var(--color-ink-muted);
}

.patient-detail__ficha-delete {
  color: var(--color-ink-soft);
}

.patient-detail__ficha-delete:hover {
  color: var(--color-danger);
}

.patient-detail__ficha-data {
  display: grid;
  grid-template-columns: minmax(120px, 38%) 1fr;
  gap: 6px var(--space-3);
  margin: 0;
}

.patient-detail__ficha-data dt {
  font-weight: 600;
  color: var(--color-ink-muted);
  font-size: 0.85rem;
}

.patient-detail__ficha-data dd {
  margin: 0;
  font-size: 0.9rem;
  color: var(--color-ink);
}

.patient-detail__ficha-notes {
  margin: var(--space-3) 0 0;
  padding-top: var(--space-3);
  border-top: 1px dashed var(--color-border);
  font-size: 0.85rem;
  color: var(--color-ink-muted);
  white-space: pre-wrap;
}

.patient-detail__total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-4);
  font-size: 1.05rem;
}

.patient-detail__total strong {
  color: var(--color-rose-700);
  font-size: 1.3rem;
}

.patient-detail__financial-list li {
  display: grid;
  grid-template-columns: 1fr 110px 100px;
  align-items: center;
  gap: var(--space-3);
}

.patient-detail__financial-list li span:nth-child(2) {
  text-align: center;
  color: var(--color-ink-muted);
  font-size: 0.9rem;
}

.patient-detail__financial-list li strong {
  text-align: right;
}

@media (max-width: 560px) {
  .patient-detail__financial-list li {
    grid-template-columns: 1fr auto;
    row-gap: 4px;
  }

  .patient-detail__financial-list li span:nth-child(2) {
    text-align: left;
    grid-column: 1;
  }
}

@media (max-width: 640px) {
  .patient-detail__header {
    flex-wrap: wrap;
  }

  .patient-detail__compare {
    grid-template-columns: 1fr;
  }
}
</style>
