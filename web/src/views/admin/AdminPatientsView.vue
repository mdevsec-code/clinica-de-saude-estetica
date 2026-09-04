<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ApiError } from '@/services/api';
import { createPatient, fetchPatients } from '@/services/admin-patients.service';
import type { PatientListItem } from '@/types';
import LoadingState from '@/components/LoadingState.vue';
import EmptyState from '@/components/EmptyState.vue';

const router = useRouter();
const patients = ref<PatientListItem[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const search = ref('');

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const { patients: data } = await fetchPatients(search.value.trim() || undefined);
    patients.value = data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      router.push({ name: 'admin-login' });
      return;
    }
    error.value = 'Não foi possível carregar os pacientes. Tente novamente.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// Debounced: sem isso, cada tecla digitada na busca dispararia uma
// requisição nova, cancelando/ignorando a anterior de forma imprevisível.
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(search, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(load, 350);
});

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

// --- Novo paciente ---
const showForm = ref(false);
const form = reactive({ name: '', whatsapp: '', phone: '', email: '', birthDate: '' });
const creating = ref(false);
const createError = ref<string | null>(null);

async function onCreate() {
  if (!form.name.trim() || !form.whatsapp.trim()) return;
  creating.value = true;
  createError.value = null;
  try {
    const { patient } = await createPatient({
      name: form.name.trim(),
      whatsapp: form.whatsapp.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      birthDate: form.birthDate || null,
    });
    router.push({ name: 'admin-patient-detail', params: { id: patient.id } });
  } catch (err) {
    createError.value = err instanceof ApiError ? err.message : 'Não foi possível cadastrar o paciente.';
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <div class="admin-patients">
    <div class="admin-patients__header">
      <span class="admin-page-icon">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16.5 5.5a3.2 3.2 0 0 1 0 6.4M21.5 20a6 6 0 0 0-5-6.2" /></svg>
      </span>
      <div>
        <h1>Pacientes</h1>
        <p>Ficha individual, histórico, retornos e evolução de cada paciente.</p>
      </div>
      <button type="button" class="button button--primary admin-patients__new-btn" @click="showForm = !showForm">
        {{ showForm ? 'Cancelar' : '+ Novo paciente' }}
      </button>
    </div>

    <form v-if="showForm" class="admin-card admin-patients__form" @submit.prevent="onCreate">
      <h2>Cadastrar paciente</h2>
      <div class="admin-form-row">
        <label class="admin-field">
          Nome completo
          <input v-model="form.name" type="text" required placeholder="Nome do paciente" />
        </label>
        <label class="admin-field admin-field--small">
          WhatsApp
          <input v-model="form.whatsapp" type="text" required placeholder="71999998888" />
        </label>
        <label class="admin-field admin-field--small">
          Telefone
          <input v-model="form.phone" type="text" placeholder="Opcional" />
        </label>
        <label class="admin-field">
          E-mail
          <input v-model="form.email" type="email" placeholder="Opcional" />
        </label>
        <label class="admin-field admin-field--small">
          Nascimento
          <input v-model="form.birthDate" type="date" />
        </label>
        <button type="submit" class="button button--primary" :disabled="creating">
          {{ creating ? 'Salvando…' : 'Cadastrar' }}
        </button>
      </div>
      <p v-if="createError" class="admin-error">{{ createError }}</p>
    </form>

    <div class="admin-patients__search">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
      <input v-model="search" type="search" placeholder="Buscar por nome, WhatsApp, telefone ou e-mail…" />
    </div>

    <Transition name="fade-swap">
      <LoadingState v-if="loading" key="loading" label="Carregando pacientes…" />
      <EmptyState v-else-if="error" key="error" title="Algo deu errado" :description="error" action-label="Tentar novamente" @action="load" />
      <EmptyState
        v-else-if="!patients.length"
        key="empty"
        :title="search ? 'Nenhum paciente encontrado.' : 'Nenhum paciente cadastrado ainda.'"
      />

      <ul v-else key="content" class="admin-patients__list">
        <li
          v-for="patient in patients"
          :key="patient.id"
          class="admin-card admin-patients__row"
          @click="router.push({ name: 'admin-patient-detail', params: { id: patient.id } })"
        >
          <span class="admin-patients__avatar">
            <img v-if="patient.profilePhotoUrl" :src="patient.profilePhotoUrl" :alt="patient.name" />
            <span v-else>{{ initials(patient.name) }}</span>
          </span>
          <div class="admin-patients__info">
            <span class="admin-patients__name">{{ patient.name }}</span>
            <span class="admin-patients__meta">
              {{ patient.phone || patient.whatsapp }} · Nascimento: {{ formatDate(patient.birthDate) }}
            </span>
          </div>
          <div class="admin-patients__stats">
            <span>{{ patient.appointmentCount }} atendimento(s)</span>
            <span>{{ patient.procedureCount }} procedimento(s)</span>
          </div>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="admin-patients__chevron"><path d="m9 6 6 6-6 6" /></svg>
        </li>
      </ul>
    </Transition>
  </div>
</template>

<style scoped>
.admin-patients__header {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.admin-patients__header p {
  color: var(--color-ink-muted);
}

.admin-patients__new-btn {
  margin-left: auto;
}

.admin-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-5);
}

.admin-patients__form {
  margin-bottom: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.admin-patients__form h2 {
  font-size: 1.1rem;
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

.admin-field input {
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 400;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
}

.admin-error {
  color: var(--color-danger);
  font-size: 0.85rem;
}

.admin-patients__search {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  padding: 10px 16px;
  margin-bottom: var(--space-5);
  color: var(--color-ink-muted);
  max-width: 480px;
}

.admin-patients__search input {
  border: none;
  background: none;
  flex: 1;
  font-size: 0.95rem;
  color: var(--color-ink);
}

.admin-patients__search input:focus {
  outline: none;
}

.admin-patients__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.admin-patients__row {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard);
}

.admin-patients__row:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}

.admin-patients__avatar {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  overflow: hidden;
  background: linear-gradient(135deg, var(--color-rose-100), var(--color-rose-300));
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: var(--color-rose-700);
}

.admin-patients__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.admin-patients__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.admin-patients__name {
  font-weight: 700;
  color: var(--color-ink);
}

.admin-patients__meta {
  font-size: 0.85rem;
  color: var(--color-ink-muted);
}

.admin-patients__stats {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  font-size: 0.8rem;
  color: var(--color-ink-muted);
  flex-shrink: 0;
}

.admin-patients__chevron {
  color: var(--color-ink-muted);
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .admin-patients__stats {
    display: none;
  }
}
</style>
