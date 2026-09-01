<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ApiError } from '@/services/api';
import { createExpense, deleteExpense, fetchExpenses } from '@/services/admin-finance.service';
import type { Expense, ExpenseCategory } from '@/types';
import LoadingState from '@/components/LoadingState.vue';
import EmptyState from '@/components/EmptyState.vue';
import AdminDatePicker from '@/components/admin/AdminDatePicker.vue';

const router = useRouter();
const expenses = ref<Expense[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const { expenses: data } = await fetchExpenses();
    expenses.value = data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      router.push({ name: 'admin-login' });
      return;
    }
    error.value = 'Não foi possível carregar os gastos. Tente novamente.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  PRODUTOS: 'Produtos',
  EQUIPAMENTOS: 'Equipamentos',
  ALUGUEL: 'Aluguel',
  MARKETING: 'Marketing',
  SALARIOS: 'Salários',
  OUTROS: 'Outros',
};

// Mesma cor por categoria usada no gráfico "Gastos por categoria" do painel
// (ver CategoryBarList.vue) — repetir o mapeamento aqui (em vez de importar)
// porque essa constante é pequena e o componente do gráfico não expõe uma
// API pública para ela; o essencial é a ORDEM/cor de cada slot ficar idêntica
// nos dois lugares para a identidade visual de cada categoria ser consistente.
const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  PRODUTOS: 'var(--chart-cat-1)',
  EQUIPAMENTOS: 'var(--chart-cat-2)',
  ALUGUEL: 'var(--chart-cat-3)',
  MARKETING: 'var(--chart-cat-4)',
  SALARIOS: 'var(--chart-cat-5)',
  OUTROS: 'var(--chart-cat-6)',
};

function formatCurrency(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

const total = computed(() => expenses.value.reduce((sum, e) => sum + e.amountCents, 0));

const currentMonthPrefix = new Date().toISOString().slice(0, 7);
const monthTotal = computed(() =>
  expenses.value.reduce((sum, e) => (e.paidAt.slice(0, 7) === currentMonthPrefix ? sum + e.amountCents : sum), 0),
);

const topCategory = computed(() => {
  const totals = {} as Record<ExpenseCategory, number>;
  for (const e of expenses.value) totals[e.category] = (totals[e.category] ?? 0) + e.amountCents;
  const entries = (Object.entries(totals) as [ExpenseCategory, number][]).sort((a, b) => b[1] - a[1]);
  return entries[0] ?? null;
});

// --- Novo gasto ---
const todayKey = new Date().toISOString().slice(0, 10);
const form = reactive({
  description: '',
  category: 'PRODUTOS' as ExpenseCategory,
  amountInput: '',
  paidAt: todayKey,
  notes: '',
});
const creating = ref(false);
const createError = ref<string | null>(null);

function parseAmountToCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\./g, '').replace(',', '.');
  const value = Number(normalized);
  if (Number.isNaN(value) || value <= 0) return null;
  return Math.round(value * 100);
}

async function onCreate() {
  const amountCents = parseAmountToCents(form.amountInput);
  if (!form.description.trim() || !amountCents) {
    createError.value = 'Informe uma descrição e um valor válido.';
    return;
  }
  creating.value = true;
  createError.value = null;
  try {
    const { expense } = await createExpense({
      description: form.description.trim(),
      category: form.category,
      amountCents,
      paidAt: form.paidAt,
      notes: form.notes.trim() || undefined,
    });
    expenses.value.unshift(expense);
    form.description = '';
    form.amountInput = '';
    form.notes = '';
  } catch (err) {
    createError.value = err instanceof ApiError ? err.message : 'Não foi possível salvar o gasto.';
  } finally {
    creating.value = false;
  }
}

// --- Excluir ---
const deletingId = ref<string | null>(null);

async function onDelete(expense: Expense) {
  if (!confirm(`Excluir o gasto "${expense.description}"?`)) return;
  deletingId.value = expense.id;
  try {
    await deleteExpense(expense.id);
    expenses.value = expenses.value.filter((e) => e.id !== expense.id);
  } catch {
    // mantém na lista para nova tentativa
  } finally {
    deletingId.value = null;
  }
}
</script>

<template>
  <div class="admin-finance">
    <div class="admin-finance__header">
      <div class="admin-finance__title">
        <span class="admin-page-icon">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="6" width="19" height="13" rx="2" /><path d="M2.5 10h19M6 15h4" /></svg>
        </span>
        <div>
          <h1>Financeiro</h1>
          <p>Controle de gastos da clínica.</p>
        </div>
      </div>
    </div>

    <div class="admin-finance__stats">
      <div class="admin-finance__stat">
        <span class="admin-finance__stat-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="6" width="19" height="13" rx="2" /><path d="M2.5 10h19" /></svg>
        </span>
        <div>
          <span class="admin-finance__stat-label">Total listado</span>
          <strong class="admin-finance__stat-value">{{ formatCurrency(total) }}</strong>
        </div>
      </div>
      <div class="admin-finance__stat">
        <span class="admin-finance__stat-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
        </span>
        <div>
          <span class="admin-finance__stat-label">Este mês</span>
          <strong class="admin-finance__stat-value">{{ formatCurrency(monthTotal) }}</strong>
        </div>
      </div>
      <div v-if="topCategory" class="admin-finance__stat">
        <span class="admin-finance__stat-icon" :style="{ color: CATEGORY_COLORS[topCategory[0]] }">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18M7 16l4-6 3 3 5-8" /></svg>
        </span>
        <div>
          <span class="admin-finance__stat-label">Maior categoria</span>
          <strong class="admin-finance__stat-value">{{ CATEGORY_LABELS[topCategory[0]] }}</strong>
        </div>
      </div>
    </div>

    <form class="admin-card admin-finance__form" @submit.prevent="onCreate">
      <h2>
        <span class="admin-card__icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </span>
        Novo gasto
      </h2>
      <div class="admin-form-row">
        <label class="admin-field">
          Descrição
          <input v-model="form.description" type="text" required placeholder="Ex.: Compra de esmaltes" />
        </label>
        <label class="admin-field admin-field--small">
          Categoria
          <select v-model="form.category">
            <option v-for="(label, key) in CATEGORY_LABELS" :key="key" :value="key">{{ label }}</option>
          </select>
        </label>
      </div>
      <div class="admin-form-row">
        <label class="admin-field admin-field--small">
          Valor (R$)
          <input v-model="form.amountInput" type="text" placeholder="0,00" required />
        </label>
        <label class="admin-field admin-field--small">
          Data
          <AdminDatePicker v-model="form.paidAt" />
        </label>
        <label class="admin-field">
          Observações (opcional)
          <input v-model="form.notes" type="text" />
        </label>
        <button type="submit" class="button button--primary" :disabled="creating">
          {{ creating ? 'Salvando…' : 'Adicionar gasto' }}
        </button>
      </div>
      <p v-if="createError" class="admin-error">{{ createError }}</p>
    </form>

    <Transition name="fade-swap" mode="out-in">
    <LoadingState v-if="loading" key="loading" label="Carregando gastos…" />
    <EmptyState v-else-if="error" key="error" title="Algo deu errado" :description="error" action-label="Tentar novamente" @action="load" />
    <EmptyState v-else-if="!expenses.length" key="empty" title="Nenhum gasto cadastrado ainda." />

    <ul v-else key="content" class="admin-finance__list">
      <li v-for="expense in expenses" :key="expense.id" class="admin-card admin-finance__row">
        <div class="admin-finance__info">
          <span class="admin-finance__description">{{ expense.description }}</span>
          <span class="admin-finance__meta">
            <span class="admin-finance__category-dot" :style="{ background: CATEGORY_COLORS[expense.category] }" />
            {{ CATEGORY_LABELS[expense.category] }} · {{ formatDate(expense.paidAt) }}
          </span>
          <span v-if="expense.notes" class="admin-finance__notes">{{ expense.notes }}</span>
        </div>
        <div class="admin-finance__actions">
          <span class="admin-finance__amount">{{ formatCurrency(expense.amountCents) }}</span>
          <button type="button" class="admin-link-btn admin-link-btn--danger" :disabled="deletingId === expense.id" @click="onDelete(expense)">
            Excluir
          </button>
        </div>
      </li>
    </ul>
    </Transition>
  </div>
</template>

<style scoped>
.admin-finance__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.admin-finance__title {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.admin-finance__header p {
  color: var(--color-ink-muted);
}

.admin-finance__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-3);
  margin-bottom: var(--space-6);
}

.admin-finance__stat {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  transition: transform var(--duration-base) var(--ease-premium), box-shadow var(--duration-base) var(--ease-premium), border-color var(--duration-base) var(--ease-premium);
}

.admin-finance__stat:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
  border-color: var(--color-rose-300);
}

.admin-finance__stat-icon {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: var(--radius-sm);
  background: var(--color-rose-100);
  color: var(--color-rose-700);
  display: flex;
  align-items: center;
  justify-content: center;
}

.admin-finance__stat-label {
  display: block;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-ink-soft);
}

.admin-finance__stat-value {
  font-family: var(--font-display);
  font-size: 1.3rem;
  color: var(--color-rose-900);
}

.admin-card {
  position: relative;
  overflow: hidden;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-5);
  transition: border-color var(--duration-base) var(--ease-premium);
}

.admin-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--color-rose-700), var(--color-gold-500));
  opacity: 0;
  transition: opacity var(--duration-base) var(--ease-premium);
}

.admin-card:hover {
  border-color: var(--color-rose-300);
}

.admin-card:hover::before {
  opacity: 1;
}

.admin-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
  background: var(--color-rose-100);
  color: var(--color-rose-700);
  flex-shrink: 0;
}

.admin-finance__row {
  transition: transform var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard);
}

.admin-finance__row:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
  border-color: var(--color-rose-300);
}

.admin-finance__category-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 2px;
  vertical-align: middle;
}

.admin-finance__form {
  margin-bottom: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.admin-finance__form h2 {
  display: flex;
  align-items: center;
  gap: 10px;
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
  flex: 0 0 140px;
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
  background-color: var(--color-bg);
  transition: border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard);
}

.admin-field input:focus-visible,
.admin-field select:focus-visible {
  border-color: var(--color-rose-700);
  box-shadow: 0 0 0 3px var(--color-rose-100);
  outline: none;
}

.admin-field select {
  /* Só dá pra estilizar o CAMPO em si — a lista de opções aberta é do
     sistema operacional, fora do alcance do CSS em praticamente todo
     navegador. appearance:none troca a setinha nativa por uma consistente
     com o resto do site. */
  padding-right: 34px;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239c5b60' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 16px;
  cursor: pointer;
}

.admin-field select:hover {
  border-color: var(--color-rose-500);
}

.admin-error {
  color: var(--color-danger);
  font-size: 0.85rem;
}

.admin-finance__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.admin-finance__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.admin-finance__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.admin-finance__description {
  font-weight: 700;
  color: var(--color-ink);
}

.admin-finance__meta {
  font-size: 0.85rem;
  color: var(--color-ink-muted);
}

.admin-finance__notes {
  font-size: 0.82rem;
  color: var(--color-ink-soft);
  font-style: italic;
}

.admin-finance__actions {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex-shrink: 0;
}

.admin-finance__amount {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--color-rose-700);
}

.admin-link-btn {
  background: none;
  border: none;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  padding: 0;
  color: var(--color-danger);
}

.admin-link-btn:hover {
  text-decoration: underline;
}

.admin-link-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
