<script setup lang="ts">
// Conciliação bancária (Fase 3): importa um extrato .ofx (formato padrão de
// exportação bancária, historicamente ligado ao Microsoft Money — daí
// "OFX money"), lista as transações e sugere gastos já cadastrados que batem
// por valor + proximidade de data para confirmação manual. Nada acontece
// automaticamente sem o clique de "Confirmar": mesmo a sugestão mais óbvia
// (valor idêntico, mesmo dia) só vira conciliação com uma ação explícita.
import { onMounted, ref } from 'vue';
import { ApiError } from '@/services/api';
import {
  fetchBankTransactions,
  fetchMatchSuggestions,
  ignoreBankTransaction,
  importBankStatement,
  matchBankTransaction,
  unmatchBankTransaction,
} from '@/services/admin-finance.service';
import type { BankTransaction, BankTransactionStatus, Expense } from '@/types';
import LoadingState from '@/components/LoadingState.vue';
import EmptyState from '@/components/EmptyState.vue';

const transactions = ref<BankTransaction[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const statusFilter = ref<BankTransactionStatus>('UNMATCHED');

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const { transactions: data } = await fetchBankTransactions(statusFilter.value);
    transactions.value = data;
  } catch {
    error.value = 'Não foi possível carregar as transações importadas.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function onFilterChange(status: BankTransactionStatus) {
  statusFilter.value = status;
  load();
}

// --- Importação ---
const fileInput = ref<HTMLInputElement | null>(null);
const importing = ref(false);
const importError = ref<string | null>(null);
const importSummary = ref<{ imported: number; skipped: number; total: number } | null>(null);

function triggerFilePicker() {
  fileInput.value?.click();
}

async function onFileSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  importing.value = true;
  importError.value = null;
  importSummary.value = null;
  try {
    const content = await file.text();
    importSummary.value = await importBankStatement(content);
    await load();
  } catch (err) {
    importError.value = err instanceof ApiError ? err.message : 'Não foi possível importar o arquivo. Verifique se é um OFX válido.';
  } finally {
    importing.value = false;
    if (fileInput.value) fileInput.value.value = '';
  }
}

// --- Sugestões de conciliação ---
const suggestionsByTxn = ref<Record<string, Expense[] | 'loading' | 'none'>>({});

async function loadSuggestions(txn: BankTransaction) {
  suggestionsByTxn.value[txn.id] = 'loading';
  try {
    const { suggestions } = await fetchMatchSuggestions(txn.id);
    suggestionsByTxn.value[txn.id] = suggestions.length ? suggestions : 'none';
  } catch {
    suggestionsByTxn.value[txn.id] = 'none';
  }
}

const matchingId = ref<string | null>(null);
async function onConfirmMatch(txn: BankTransaction, expense: Expense) {
  matchingId.value = txn.id;
  try {
    await matchBankTransaction(txn.id, expense.id);
    transactions.value = transactions.value.filter((t) => t.id !== txn.id);
  } catch {
    // mantém na lista para nova tentativa
  } finally {
    matchingId.value = null;
  }
}

async function onIgnore(txn: BankTransaction) {
  matchingId.value = txn.id;
  try {
    await ignoreBankTransaction(txn.id);
    transactions.value = transactions.value.filter((t) => t.id !== txn.id);
  } catch {
    // mantém na lista para nova tentativa
  } finally {
    matchingId.value = null;
  }
}

async function onUnmatch(txn: BankTransaction) {
  matchingId.value = txn.id;
  try {
    await unmatchBankTransaction(txn.id);
    transactions.value = transactions.value.filter((t) => t.id !== txn.id);
  } catch {
    // mantém na lista para nova tentativa
  } finally {
    matchingId.value = null;
  }
}

function formatCurrency(cents: number) {
  return (Math.abs(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

const FILTERS: { key: BankTransactionStatus; label: string }[] = [
  { key: 'UNMATCHED', label: 'Não conciliadas' },
  { key: 'MATCHED', label: 'Conciliadas' },
  { key: 'IGNORED', label: 'Ignoradas' },
];
</script>

<template>
  <div class="admin-card admin-bank">
    <h2>
      <span class="admin-card__icon">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M8 15h4" /></svg>
      </span>
      Conciliação bancária
    </h2>
    <p class="admin-bank__hint">
      Importe o extrato em formato OFX do seu banco (Money) para cruzar automaticamente com os gastos já cadastrados.
    </p>

    <div class="admin-bank__import">
      <input ref="fileInput" type="file" accept=".ofx,.qfx" class="visually-hidden" @change="onFileSelected" />
      <button type="button" class="button button--primary" :disabled="importing" @click="triggerFilePicker">
        {{ importing ? 'Importando…' : 'Importar extrato OFX' }}
      </button>
      <p v-if="importSummary" class="admin-bank__import-result">
        {{ importSummary.imported }} nova(s) transação(ões) importada(s)
        <template v-if="importSummary.skipped"> · {{ importSummary.skipped }} já existiam</template>
      </p>
      <p v-if="importError" class="admin-error">{{ importError }}</p>
    </div>

    <div class="admin-bank__filters" role="tablist">
      <button
        v-for="f in FILTERS"
        :key="f.key"
        type="button"
        class="admin-bank__filter"
        :class="{ 'admin-bank__filter--active': statusFilter === f.key }"
        @click="onFilterChange(f.key)"
      >
        {{ f.label }}
      </button>
    </div>

    <Transition name="fade-swap">
      <LoadingState v-if="loading" key="loading" label="Carregando transações…" />
      <EmptyState v-else-if="error" key="error" title="Algo deu errado" :description="error" action-label="Tentar novamente" @action="load" />
      <EmptyState
        v-else-if="!transactions.length"
        key="empty"
        :title="statusFilter === 'UNMATCHED' ? 'Nenhuma transação pendente de conciliação.' : 'Nada por aqui ainda.'"
        :description="statusFilter === 'UNMATCHED' ? 'Importe um extrato OFX para começar.' : undefined"
      />

      <ul v-else key="content" class="admin-bank__list">
        <li v-for="txn in transactions" :key="txn.id" class="admin-bank__row" :class="{ 'admin-bank__row--credit': txn.amountCents >= 0 }">
          <div class="admin-bank__info">
            <span class="admin-bank__description">{{ txn.description }}</span>
            <span class="admin-bank__meta">
              {{ formatDate(txn.postedAt) }}
              <template v-if="txn.memo"> · {{ txn.memo }}</template>
            </span>
            <span v-if="txn.matchedExpense" class="admin-bank__matched">
              Conciliado com "{{ txn.matchedExpense.description }}"
            </span>
          </div>
          <div class="admin-bank__amount-col">
            <span class="admin-bank__amount" :class="{ 'admin-bank__amount--credit': txn.amountCents >= 0 }">
              {{ txn.amountCents >= 0 ? '+' : '−' }}{{ formatCurrency(txn.amountCents) }}
            </span>

            <template v-if="statusFilter === 'UNMATCHED'">
              <button
                v-if="txn.amountCents < 0 && !suggestionsByTxn[txn.id]"
                type="button"
                class="admin-link-btn"
                @click="loadSuggestions(txn)"
              >
                Ver sugestões
              </button>
              <button type="button" class="admin-link-btn admin-link-btn--danger" :disabled="matchingId === txn.id" @click="onIgnore(txn)">
                Ignorar
              </button>
            </template>
            <button v-else-if="statusFilter === 'MATCHED'" type="button" class="admin-link-btn" :disabled="matchingId === txn.id" @click="onUnmatch(txn)">
              Desfazer conciliação
            </button>
          </div>

          <div v-if="suggestionsByTxn[txn.id] === 'loading'" class="admin-bank__suggestions">Buscando gastos correspondentes…</div>
          <div v-else-if="suggestionsByTxn[txn.id] === 'none'" class="admin-bank__suggestions admin-bank__suggestions--empty">
            Nenhum gasto cadastrado bate com essa transação — cadastre-o na aba Visão geral e recarregue.
          </div>
          <ul v-else-if="Array.isArray(suggestionsByTxn[txn.id])" class="admin-bank__suggestions-list">
            <li v-for="expense in suggestionsByTxn[txn.id] as Expense[]" :key="expense.id">
              <span>{{ expense.description }} · {{ formatCurrency(expense.amountCents) }}</span>
              <button type="button" class="button button--ghost" :disabled="matchingId === txn.id" @click="onConfirmMatch(txn, expense)">
                Confirmar
              </button>
            </li>
          </ul>
        </li>
      </ul>
    </Transition>
  </div>
</template>

<style scoped>
.admin-bank h2 {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1.15rem;
  margin-bottom: var(--space-2);
}

.admin-bank__hint {
  color: var(--color-ink-muted);
  font-size: 0.88rem;
  margin-bottom: var(--space-4);
}

.admin-bank__import {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  padding-bottom: var(--space-5);
  margin-bottom: var(--space-5);
  border-bottom: 1px solid var(--color-border);
}

.admin-bank__import-result {
  font-size: 0.85rem;
  color: var(--color-success);
  font-weight: 600;
}

.admin-bank__filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.admin-bank__filter {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  color: var(--color-ink-muted);
  font-weight: 600;
  font-size: 0.82rem;
  padding: 6px 14px;
  border-radius: var(--radius-pill);
  min-height: var(--touch-target-min);
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard);
}

.admin-bank__filter:hover {
  border-color: var(--color-rose-300);
  color: var(--color-rose-700);
}

.admin-bank__filter--active {
  background: var(--color-rose-100);
  border-color: var(--color-rose-300);
  color: var(--color-rose-900);
}

.admin-bank__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.admin-bank__row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--color-danger);
}

.admin-bank__row--credit {
  border-left-color: var(--color-success);
}

.admin-bank__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.admin-bank__description {
  font-weight: 700;
  color: var(--color-ink);
}

.admin-bank__meta {
  font-size: 0.82rem;
  color: var(--color-ink-muted);
}

.admin-bank__matched {
  font-size: 0.82rem;
  color: var(--color-success);
  font-weight: 600;
}

.admin-bank__amount-col {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.admin-bank__amount {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--color-danger);
}

.admin-bank__amount--credit {
  color: var(--color-success);
}

.admin-bank__suggestions {
  grid-column: 1 / -1;
  font-size: 0.85rem;
  color: var(--color-ink-soft);
  font-style: italic;
}

.admin-bank__suggestions-list {
  grid-column: 1 / -1;
  list-style: none;
  margin: var(--space-2) 0 0;
  padding: var(--space-3);
  background: var(--color-bg);
  border-radius: var(--radius-sm);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.admin-bank__suggestions-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  font-size: 0.88rem;
}

.admin-bank__suggestions-list .button--ghost {
  padding: 6px 16px;
  font-size: 0.8rem;
}

.admin-link-btn {
  background: none;
  border: none;
  font-weight: 600;
  font-size: 0.82rem;
  cursor: pointer;
  padding: 0;
  color: var(--color-rose-700);
}

.admin-link-btn--danger {
  color: var(--color-danger);
}

.admin-link-btn:hover {
  text-decoration: underline;
}

.admin-link-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .admin-bank__row {
    grid-template-columns: 1fr;
  }
  .admin-bank__amount-col {
    align-items: flex-start;
    flex-direction: row;
    gap: var(--space-3);
  }
}
</style>
