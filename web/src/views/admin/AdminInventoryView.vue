<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ApiError } from '@/services/api';
import { adjustInventoryQuantity, createInventoryItem, fetchInventory, updateInventoryItem } from '@/services/admin-inventory.service';
import type { InventoryItem } from '@/types';
import LoadingState from '@/components/LoadingState.vue';
import EmptyState from '@/components/EmptyState.vue';

const router = useRouter();
const items = ref<InventoryItem[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const { items: data } = await fetchInventory();
    items.value = data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      router.push({ name: 'admin-login' });
      return;
    }
    error.value = 'Não foi possível carregar o estoque. Tente novamente.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function formatCurrency(cents: number | null) {
  if (cents == null) return '—';
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// --- Novo item ---
const form = reactive({ name: '', unit: 'un', quantity: 0, minQuantity: 0, costInput: '' });
const creating = ref(false);
const createError = ref<string | null>(null);

function parseCostToCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\./g, '').replace(',', '.');
  const value = Number(normalized);
  if (Number.isNaN(value) || value < 0) return null;
  return Math.round(value * 100);
}

async function onCreate() {
  if (!form.name.trim()) return;
  creating.value = true;
  createError.value = null;
  try {
    const { item } = await createInventoryItem({
      name: form.name.trim(),
      unit: form.unit.trim() || 'un',
      quantity: form.quantity,
      minQuantity: form.minQuantity,
      costCents: parseCostToCents(form.costInput),
    });
    items.value.push(item);
    items.value.sort((a, b) => a.name.localeCompare(b.name));
    form.name = '';
    form.unit = 'un';
    form.quantity = 0;
    form.minQuantity = 0;
    form.costInput = '';
  } catch (err) {
    createError.value = err instanceof ApiError ? err.message : 'Não foi possível criar o item.';
  } finally {
    creating.value = false;
  }
}

// --- Ajuste rápido de quantidade ---
const pendingId = ref<string | null>(null);

async function adjust(item: InventoryItem, delta: number) {
  if (item.quantity + delta < 0) return;
  pendingId.value = item.id;
  try {
    const { item: updated } = await adjustInventoryQuantity(item.id, delta);
    item.quantity = updated.quantity;
  } catch {
    // botão volta ao normal, quantidade não muda — dá para tentar de novo
  } finally {
    pendingId.value = null;
  }
}

async function toggleActive(item: InventoryItem) {
  const next = !item.active;
  item.active = next;
  try {
    await updateInventoryItem(item.id, { active: next });
  } catch {
    item.active = !next;
  }
}
</script>

<template>
  <div class="admin-inventory">
    <div class="admin-inventory__header">
      <span class="admin-page-icon">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9.5 12 4l9 5.5V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" /><path d="M8 21v-7h8v7" /></svg>
      </span>
      <div>
        <h1>Estoque</h1>
        <p>Controle de produtos e materiais da clínica.</p>
      </div>
    </div>

    <form class="admin-card admin-inventory__form" @submit.prevent="onCreate">
      <h2>Novo item</h2>
      <div class="admin-form-row">
        <label class="admin-field">
          Nome
          <input v-model="form.name" type="text" required placeholder="Ex.: Esmalte vermelho" />
        </label>
        <label class="admin-field admin-field--small">
          Unidade
          <input v-model="form.unit" type="text" placeholder="un, ml, g…" />
        </label>
        <label class="admin-field admin-field--small">
          Quantidade
          <input v-model.number="form.quantity" type="number" min="0" />
        </label>
        <label class="admin-field admin-field--small">
          Mínimo
          <input v-model.number="form.minQuantity" type="number" min="0" />
        </label>
        <label class="admin-field admin-field--small">
          Custo (R$)
          <input v-model="form.costInput" type="text" placeholder="Opcional" />
        </label>
        <button type="submit" class="button button--primary" :disabled="creating">
          {{ creating ? 'Salvando…' : 'Adicionar item' }}
        </button>
      </div>
      <p v-if="createError" class="admin-error">{{ createError }}</p>
    </form>

    <Transition name="fade-swap">
    <LoadingState v-if="loading" key="loading" label="Carregando estoque…" />
    <EmptyState v-else-if="error" key="error" title="Algo deu errado" :description="error" action-label="Tentar novamente" @action="load" />
    <EmptyState v-else-if="!items.length" key="empty" title="Nenhum item cadastrado ainda." />

    <ul v-else key="content" class="admin-inventory__list">
      <li
        v-for="item in items"
        :key="item.id"
        class="admin-card admin-inventory__row"
        :class="{ 'admin-inventory__row--low': item.quantity <= item.minQuantity, 'admin-inventory__row--inactive': !item.active }"
      >
        <div class="admin-inventory__info">
          <span class="admin-inventory__name">
            {{ item.name }}
            <span v-if="item.quantity <= item.minQuantity" class="admin-badge admin-badge--warning">Estoque baixo</span>
          </span>
          <span class="admin-inventory__meta">Mínimo: {{ item.minQuantity }}{{ item.unit }} · Custo: {{ formatCurrency(item.costCents) }}</span>
        </div>

        <div class="admin-inventory__adjust">
          <button type="button" class="admin-inventory__step" :disabled="pendingId === item.id || item.quantity <= 0" @click="adjust(item, -1)">−</button>
          <span class="admin-inventory__qty">{{ item.quantity }}{{ item.unit }}</span>
          <button type="button" class="admin-inventory__step" :disabled="pendingId === item.id" @click="adjust(item, 1)">+</button>
        </div>

        <button type="button" class="admin-link-btn" @click="toggleActive(item)">
          {{ item.active ? 'Desativar' : 'Reativar' }}
        </button>
      </li>
    </ul>
    </Transition>
  </div>
</template>

<style scoped>
.admin-inventory__header {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.admin-inventory__header p {
  color: var(--color-ink-muted);
}

.admin-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-5);
}

.admin-inventory__form {
  margin-bottom: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.admin-inventory__form h2 {
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
  flex: 0 0 110px;
  min-width: 90px;
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

.admin-inventory__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.admin-inventory__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.admin-inventory__row {
  transition: transform var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard);
}

.admin-inventory__row:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}

.admin-inventory__row--low {
  border-color: var(--color-danger);
}

.admin-inventory__row--inactive {
  opacity: 0.6;
}

.admin-inventory__info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.admin-inventory__name {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-weight: 700;
  color: var(--color-ink);
}

.admin-inventory__meta {
  font-size: 0.85rem;
  color: var(--color-ink-muted);
}

.admin-badge {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 9px;
  border-radius: var(--radius-pill);
}

.admin-badge--warning {
  background: #fce4de;
  color: var(--color-danger);
}

.admin-inventory__adjust {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-shrink: 0;
}

.admin-inventory__step {
  /* 44px nos dois eixos: a regra global de touch target (button, ver
     global.css) já forçava a ALTURA pra 44px, mas sem largura equivalente o
     botão de +/- virava uma pílula oval em vez do círculo pretendido — ruim
     justo no controle que a recepção mais usa por tablet pra ajustar
     estoque. */
  width: var(--touch-target-min);
  height: var(--touch-target-min);
  border-radius: 50%;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--color-rose-700);
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard);
}

.admin-inventory__step:hover:not(:disabled) {
  border-color: var(--color-rose-500);
  transform: scale(1.08);
}

.admin-inventory__step:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.admin-inventory__qty {
  min-width: 56px;
  text-align: center;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--color-ink);
}

.admin-link-btn {
  background: none;
  border: none;
  color: var(--color-rose-700);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
}

.admin-link-btn:hover {
  text-decoration: underline;
}
</style>
