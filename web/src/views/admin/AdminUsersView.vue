<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ApiError } from '@/services/api';
import { createUser, fetchUsers, setUserActive } from '@/services/admin-users.service';
import { useAuthStore } from '@/stores/auth';
import type { AdminAccount } from '@/types';
import AdminSelect, { type AdminSelectOption } from '@/components/admin/AdminSelect.vue';
import LoadingState from '@/components/LoadingState.vue';
import EmptyState from '@/components/EmptyState.vue';

const router = useRouter();
const auth = useAuthStore();

const roleOptions: AdminSelectOption<'ADMIN' | 'RECEPTION'>[] = [
  { value: 'RECEPTION', label: 'Recepção' },
  { value: 'ADMIN', label: 'Administrador' },
];

const users = ref<AdminAccount[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const { users: data } = await fetchUsers();
    users.value = data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      router.push({ name: 'admin-login' });
      return;
    }
    error.value = 'Não foi possível carregar as contas. Tente novamente.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const ROLE_LABELS = { ADMIN: 'Administrador', RECEPTION: 'Recepção' } as const;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// --- Nova conta ---
const form = reactive({ name: '', email: '', password: '', role: 'RECEPTION' as 'ADMIN' | 'RECEPTION' });
const creating = ref(false);
const createError = ref<string | null>(null);

async function onCreate() {
  creating.value = true;
  createError.value = null;
  try {
    const { user } = await createUser({ ...form });
    users.value.push(user);
    form.name = '';
    form.email = '';
    form.password = '';
    form.role = 'RECEPTION';
  } catch (err) {
    createError.value = err instanceof ApiError ? err.message : 'Não foi possível criar a conta.';
  } finally {
    creating.value = false;
  }
}

// --- Ativar/desativar ---
const pendingId = ref<string | null>(null);
const toggleError = ref<string | null>(null);

async function toggleActive(user: AdminAccount) {
  const next = !user.active;
  pendingId.value = user.id;
  toggleError.value = null;
  try {
    await setUserActive(user.id, next);
    user.active = next;
  } catch (err) {
    toggleError.value = err instanceof ApiError ? err.message : 'Não foi possível atualizar esta conta.';
  } finally {
    pendingId.value = null;
  }
}
</script>

<template>
  <div class="admin-users">
    <div class="admin-users__header">
      <span class="admin-page-icon">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16.5 5.5a3.5 3.5 0 0 1 0 6.8M21.5 20a6 6 0 0 0-5-6.2" /></svg>
      </span>
      <div>
        <h1>Usuários</h1>
        <p>Contas de acesso ao painel administrativo — dono da clínica e recepção.</p>
      </div>
    </div>

    <form class="admin-card admin-users__form" @submit.prevent="onCreate">
      <h2>Nova conta</h2>
      <div class="admin-form-row">
        <label class="admin-field">
          Nome
          <input v-model="form.name" type="text" required />
        </label>
        <label class="admin-field">
          E-mail
          <input v-model="form.email" type="email" required />
        </label>
      </div>
      <div class="admin-form-row">
        <label class="admin-field">
          Senha
          <input v-model="form.password" type="password" minlength="8" required placeholder="Mínimo 8 caracteres" />
        </label>
        <label class="admin-field admin-field--small">
          Função
          <AdminSelect v-model="form.role" :options="roleOptions" />
        </label>
        <button type="submit" class="button button--primary" :disabled="creating">
          {{ creating ? 'Criando…' : 'Criar conta' }}
        </button>
      </div>
      <p v-if="createError" class="admin-error">{{ createError }}</p>
    </form>

    <Transition name="fade-swap">
    <LoadingState v-if="loading" key="loading" label="Carregando contas…" />
    <EmptyState v-else-if="error" key="error" title="Algo deu errado" :description="error" action-label="Tentar novamente" @action="load" />

    <ul v-else key="content" class="admin-users__list">
      <li v-for="user in users" :key="user.id" class="admin-card admin-users__row" :class="{ 'admin-users__row--inactive': !user.active }">
        <div class="admin-users__info">
          <span class="admin-users__name">
            {{ user.name }}
            <span v-if="user.id === auth.user?.id" class="admin-badge admin-badge--muted">Você</span>
          </span>
          <span class="admin-users__email">{{ user.email }}</span>
          <span class="admin-users__meta">Criada em {{ formatDate(user.createdAt) }}</span>
        </div>
        <div class="admin-users__actions">
          <span class="admin-badge" :class="{ 'admin-badge--featured': user.role === 'ADMIN' }">{{ ROLE_LABELS[user.role] }}</span>
          <span v-if="!user.active" class="admin-badge admin-badge--muted">Inativa</span>
          <button
            type="button"
            class="admin-link-btn"
            :class="{ 'admin-link-btn--muted': user.active }"
            :disabled="pendingId === user.id || user.id === auth.user?.id"
            @click="toggleActive(user)"
          >
            {{ user.active ? 'Desativar' : 'Reativar' }}
          </button>
        </div>
      </li>
    </ul>
    </Transition>
    <p v-if="toggleError" class="admin-error">{{ toggleError }}</p>
  </div>
</template>

<style scoped>
.admin-users__header {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.admin-users__header p {
  color: var(--color-ink-muted);
}

.admin-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-5);
}

.admin-users__form {
  margin-bottom: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.admin-users__form h2 {
  font-size: 1.1rem;
}

.admin-form-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-3);
}

/* Aparência (tipografia, borda, fundo, foco, setinha do select) é
   compartilhada — ver .admin-field em styles/global.css. Aqui fica só o
   dimensionamento específico deste formulário dentro do layout flex-wrap. */
.admin-field {
  flex: 1;
  min-width: 180px;
}

.admin-field--small {
  flex: 0 0 160px;
  min-width: 140px;
}

.admin-error {
  color: var(--color-danger);
  font-size: 0.85rem;
}

.admin-users__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.admin-users__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.admin-users__row {
  transition: transform var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard);
}

.admin-users__row:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}

.admin-users__row--inactive {
  opacity: 0.65;
}

.admin-users__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.admin-users__name {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-weight: 700;
  color: var(--color-ink);
}

.admin-users__email {
  font-size: 0.9rem;
  color: var(--color-rose-700);
}

.admin-users__meta {
  font-size: 0.8rem;
  color: var(--color-ink-soft);
}

.admin-users__actions {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex-shrink: 0;
}

.admin-badge {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  background: var(--color-rose-100);
  color: var(--color-rose-700);
}

.admin-badge--featured {
  background: var(--color-rose-700);
  color: #fff;
}

.admin-badge--muted {
  background: var(--color-surface-muted);
  color: var(--color-ink-soft);
}

.admin-link-btn {
  background: none;
  border: none;
  color: var(--color-danger);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  padding: 0;
}

.admin-link-btn--muted {
  color: var(--color-rose-700);
}

.admin-link-btn:hover {
  text-decoration: underline;
}

.admin-link-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  text-decoration: none;
}
</style>
