<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ApiError } from '@/services/api';
import { fetchAuditLogs } from '@/services/admin-audit.service';
import type { AuditAction, AuditLog, AuditLogList } from '@/types';
import LoadingState from '@/components/LoadingState.vue';
import EmptyState from '@/components/EmptyState.vue';
import AdminSelect, { type AdminSelectOption } from '@/components/admin/AdminSelect.vue';
import AdminDatePicker from '@/components/admin/AdminDatePicker.vue';

const router = useRouter();

const result = ref<AuditLogList | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const page = ref(1);
const PAGE_SIZE = 30;

const filters = reactive({
  userId: '',
  entityType: '',
  action: '' as AuditAction | '',
  from: '',
  to: '',
});

async function load() {
  loading.value = true;
  error.value = null;
  try {
    result.value = await fetchAuditLogs({
      userId: filters.userId || undefined,
      entityType: filters.entityType || undefined,
      action: filters.action || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      page: page.value,
      pageSize: PAGE_SIZE,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      router.push({ name: 'admin-login' });
      return;
    }
    error.value = 'Não foi possível carregar o histórico de auditoria. Tente novamente.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function applyFilters() {
  page.value = 1;
  load();
}

function clearFilters() {
  filters.userId = '';
  filters.entityType = '';
  filters.action = '';
  filters.from = '';
  filters.to = '';
  applyFilters();
}

function goToPage(next: number) {
  page.value = next;
  load();
}

const totalPages = computed(() => (result.value ? Math.max(1, Math.ceil(result.value.total / result.value.pageSize)) : 1));

const userOptions = computed<AdminSelectOption[]>(() => [
  { value: '', label: 'Todos' },
  ...(result.value?.users.map((u) => ({ value: u.userId, label: u.userName })) ?? []),
]);

// Rótulos em português por tipo de registro — a lista de tipos que existem
// de verdade vem do backend (result.entityTypes, ver audit.service.ts no
// servidor), então um tipo novo que apareça no futuro (uma rota nova
// instrumentada) aparece aqui automaticamente como filtro, mesmo sem rótulo
// amigável cadastrado (cai no fallback do próprio valor bruto).
const ENTITY_TYPE_LABELS: Record<string, string> = {
  category: 'Categoria',
  service: 'Serviço',
  expense: 'Gasto',
  bank_transaction: 'Transação bancária',
  inventory_item: 'Item de estoque',
  user: 'Usuário',
  appointment: 'Agendamento',
};

const entityTypeOptions = computed<AdminSelectOption[]>(() => [
  { value: '', label: 'Todos' },
  ...(result.value?.entityTypes.map((t) => ({ value: t, label: ENTITY_TYPE_LABELS[t] ?? t })) ?? []),
]);

const actionOptions: AdminSelectOption<AuditAction | ''>[] = [
  { value: '', label: 'Todas' },
  { value: 'CREATE', label: 'Criação' },
  { value: 'UPDATE', label: 'Alteração' },
  { value: 'DELETE', label: 'Exclusão' },
];

const ACTION_VERBS: Record<AuditAction, string> = {
  CREATE: 'criou',
  UPDATE: 'atualizou',
  DELETE: 'excluiu',
};

const ACTION_ICON: Record<AuditAction, string> = {
  CREATE: 'M12 5v14M5 12h14',
  UPDATE: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
  DELETE: 'M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m-7 0 1 12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-12',
};

function entityTypeLabel(type: string): string {
  return (ENTITY_TYPE_LABELS[type] ?? type).toLowerCase();
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const expandedId = ref<string | null>(null);
function toggleDetails(log: AuditLog) {
  expandedId.value = expandedId.value === log.id ? null : log.id;
}

function formatChanges(changes: Record<string, unknown> | null): string {
  if (!changes || !Object.keys(changes).length) return 'Sem detalhes adicionais.';
  return JSON.stringify(changes, null, 2);
}
</script>

<template>
  <div class="admin-audit">
    <div class="admin-audit__header">
      <span class="admin-page-icon">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      </span>
      <div>
        <h1>Auditoria</h1>
        <p>Histórico de tudo que a equipe registrou ou alterou no painel.</p>
      </div>
    </div>

    <div class="admin-card admin-audit__filters">
      <div class="admin-form-row">
        <label class="admin-field admin-field--small">
          Usuário
          <AdminSelect v-model="filters.userId" :options="userOptions" />
        </label>
        <label class="admin-field admin-field--small">
          Tipo de registro
          <AdminSelect v-model="filters.entityType" :options="entityTypeOptions" />
        </label>
        <label class="admin-field admin-field--small">
          Ação
          <AdminSelect v-model="filters.action" :options="actionOptions" />
        </label>
        <label class="admin-field admin-field--date">
          De
          <AdminDatePicker v-model="filters.from" />
        </label>
        <label class="admin-field admin-field--date">
          Até
          <AdminDatePicker v-model="filters.to" />
        </label>
        <button type="button" class="button button--primary" @click="applyFilters">Filtrar</button>
        <button type="button" class="admin-link-btn" @click="clearFilters">Limpar filtros</button>
      </div>
    </div>

    <Transition name="fade-swap">
      <LoadingState v-if="loading" key="loading" label="Carregando histórico…" />
      <EmptyState v-else-if="error" key="error" title="Algo deu errado" :description="error" action-label="Tentar novamente" @action="load" />
      <EmptyState v-else-if="!result?.logs.length" key="empty" title="Nenhum registro de auditoria encontrado." description="Ações de criação, alteração e exclusão feitas pela equipe aparecem aqui." />

      <div v-else key="content">
        <ul class="admin-audit__list">
          <li v-for="log in result.logs" :key="log.id" class="admin-card admin-audit__row" :class="`admin-audit__row--${log.action.toLowerCase()}`">
            <span class="admin-audit__icon" :class="`admin-audit__icon--${log.action.toLowerCase()}`">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="ACTION_ICON[log.action]" /></svg>
            </span>
            <div class="admin-audit__body">
              <p class="admin-audit__desc">
                <strong>{{ log.userName }}</strong>
                {{ ACTION_VERBS[log.action] }}
                {{ entityTypeLabel(log.entityType) }}
                <span v-if="log.entityLabel" class="admin-audit__entity">"{{ log.entityLabel }}"</span>
              </p>
              <p class="admin-audit__meta">{{ formatDateTime(log.createdAt) }} · {{ log.method }} {{ log.path }}</p>
              <button type="button" class="admin-link-btn admin-audit__toggle" @click="toggleDetails(log)">
                {{ expandedId === log.id ? 'Ocultar detalhes' : 'Ver detalhes' }}
              </button>
              <pre v-if="expandedId === log.id" class="admin-audit__details">{{ formatChanges(log.changes) }}</pre>
            </div>
          </li>
        </ul>

        <div v-if="totalPages > 1" class="admin-audit__pagination">
          <button type="button" class="button button--ghost" :disabled="page <= 1" @click="goToPage(page - 1)">← Anterior</button>
          <span>Página {{ page }} de {{ totalPages }}</span>
          <button type="button" class="button button--ghost" :disabled="page >= totalPages" @click="goToPage(page + 1)">Próxima →</button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.admin-audit__header {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.admin-audit__header p {
  color: var(--color-ink-muted);
}

.admin-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-5);
}

.admin-audit__filters {
  margin-bottom: var(--space-6);
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
  min-width: 160px;
}

.admin-field--small {
  flex: 0 0 160px;
  min-width: 140px;
}

/* Mesma variante já usada em AdminFinanceView.vue: o gatilho do
   AdminDatePicker precisa de mais espaço que um --small rígido permite sem
   vazar visualmente por cima do botão ao lado (ver comentário lá / em
   AdminDatePicker.vue). */
.admin-field--date {
  flex: 0 1 auto;
  min-width: 158px;
}

.admin-link-btn {
  background: none;
  border: none;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  padding: 0;
  color: var(--color-rose-700);
}

.admin-link-btn:hover {
  text-decoration: underline;
}

.admin-audit__list {
  list-style: none;
  margin: 0 0 var(--space-5);
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.admin-audit__row {
  display: flex;
  gap: var(--space-3);
  border-left: 3px solid var(--color-border);
  transition: transform var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard);
}

.admin-audit__row:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}

.admin-audit__row--create {
  border-left-color: var(--color-success);
}

.admin-audit__row--update {
  border-left-color: var(--color-gold-500);
}

.admin-audit__row--delete {
  border-left-color: var(--color-danger);
}

.admin-audit__icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface-muted);
  color: var(--color-ink-muted);
}

.admin-audit__icon--create {
  background: rgba(79, 122, 92, 0.12);
  color: var(--color-success);
}

.admin-audit__icon--update {
  background: var(--color-gold-100);
  color: var(--color-gold-700);
}

.admin-audit__icon--delete {
  background: rgba(164, 69, 63, 0.12);
  color: var(--color-danger);
}

.admin-audit__body {
  min-width: 0;
  flex: 1;
}

.admin-audit__desc {
  color: var(--color-ink);
  font-size: 0.95rem;
}

.admin-audit__entity {
  color: var(--color-rose-700);
  font-weight: 600;
}

.admin-audit__meta {
  font-size: 0.78rem;
  color: var(--color-ink-soft);
  margin-top: 2px;
  font-family: monospace;
}

.admin-audit__toggle {
  margin-top: 6px;
  font-size: 0.78rem;
}

.admin-audit__details {
  margin-top: var(--space-2);
  padding: var(--space-3);
  background: var(--color-bg);
  border-radius: var(--radius-sm);
  font-size: 0.78rem;
  overflow-x: auto;
  color: var(--color-ink-muted);
}

.admin-audit__pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  font-size: 0.85rem;
  color: var(--color-ink-muted);
}

.admin-audit__pagination .button {
  padding: 8px 18px;
  font-size: 0.85rem;
}
</style>
