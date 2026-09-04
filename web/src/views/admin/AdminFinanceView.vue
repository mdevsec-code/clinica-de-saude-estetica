<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ApiError } from '@/services/api';
import {
  createExpense,
  deleteExpense,
  fetchDailyRevenueHistory,
  fetchDre,
  fetchExpenses,
  fetchTodaySummary,
  markExpensePaid,
} from '@/services/admin-finance.service';
import type { DailyRevenueHistory, DreReport, Expense, ExpenseCategory, ExpenseStatus, TodaySummary } from '@/types';
import LoadingState from '@/components/LoadingState.vue';
import EmptyState from '@/components/EmptyState.vue';
import AdminDatePicker from '@/components/admin/AdminDatePicker.vue';
import AdminSelect, { type AdminSelectOption } from '@/components/admin/AdminSelect.vue';
import BarChart from '@/components/admin/BarChart.vue';
import AdminBankReconciliation from '@/components/admin/AdminBankReconciliation.vue';
import { toLocalDateKey } from '@/utils/calendar';

const router = useRouter();

// --- Abas: a tela cresceu de "lista de gastos" para quatro assuntos
// distintos (visão do dia a dia, gastos, DRE, conciliação bancária) — abas
// evitam uma página infinita de scroll misturando tudo, seguindo o mesmo
// padrão de pílula segmentada já usado em Agenda (mês/semana/dia). ---
type FinanceTab = 'overview' | 'dre' | 'bank';
const activeTab = ref<FinanceTab>('overview');
const TABS: { key: FinanceTab; label: string }[] = [
  { key: 'overview', label: 'Visão geral' },
  { key: 'dre', label: 'DRE' },
  { key: 'bank', label: 'Conciliação bancária' },
];

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

// --- Vencimentos/recebimentos do dia + histórico de faturamento diário ---
const today = ref<TodaySummary | null>(null);
const todayLoading = ref(true);
async function loadToday() {
  todayLoading.value = true;
  try {
    today.value = await fetchTodaySummary();
  } catch {
    today.value = null;
  } finally {
    todayLoading.value = false;
  }
}

const revenueHistory = ref<DailyRevenueHistory | null>(null);
const revenueLoading = ref(true);
async function loadRevenueHistory() {
  revenueLoading.value = true;
  try {
    revenueHistory.value = await fetchDailyRevenueHistory(30);
  } catch {
    revenueHistory.value = null;
  } finally {
    revenueLoading.value = false;
  }
}

onMounted(() => {
  load();
  loadToday();
  loadRevenueHistory();
});

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  PRODUTOS: 'Produtos',
  EQUIPAMENTOS: 'Equipamentos',
  ALUGUEL: 'Aluguel',
  MARKETING: 'Marketing',
  SALARIOS: 'Salários',
  OUTROS: 'Outros',
};

const categoryOptions: AdminSelectOption<ExpenseCategory>[] = (Object.entries(CATEGORY_LABELS) as [ExpenseCategory, string][]).map(
  ([value, label]) => ({ value, label }),
);

const statusOptions: AdminSelectOption<ExpenseStatus>[] = [
  { value: 'PAID', label: 'Já pago' },
  { value: 'PENDING', label: 'Pendente' },
];

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

const currentMonthPrefix = toLocalDateKey(new Date()).slice(0, 7);
const monthTotal = computed(() =>
  expenses.value.reduce(
    (sum, e) => (e.status === 'PAID' && e.paidAt?.slice(0, 7) === currentMonthPrefix ? sum + e.amountCents : sum),
    0,
  ),
);

const topCategory = computed(() => {
  const totals = {} as Record<ExpenseCategory, number>;
  for (const e of expenses.value) totals[e.category] = (totals[e.category] ?? 0) + e.amountCents;
  const entries = (Object.entries(totals) as [ExpenseCategory, number][]).sort((a, b) => b[1] - a[1]);
  return entries[0] ?? null;
});

const revenueChartData = computed(() => {
  if (!revenueHistory.value) return [];
  return revenueHistory.value.days.map((d) => ({ label: String(Number(d.date.slice(8, 10))), value: d.totalCents / 100 }));
});

// --- Novo gasto ---
const todayKey = toLocalDateKey(new Date());
const form = reactive({
  description: '',
  category: 'PRODUTOS' as ExpenseCategory,
  amountInput: '',
  status: 'PAID' as ExpenseStatus,
  paidAt: todayKey,
  dueAt: todayKey,
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
      status: form.status,
      dueAt: form.status === 'PENDING' ? form.dueAt : null,
      paidAt: form.status === 'PAID' ? form.paidAt : null,
      notes: form.notes.trim() || undefined,
    });
    expenses.value.unshift(expense);
    form.description = '';
    form.amountInput = '';
    form.notes = '';
    loadToday();
  } catch (err) {
    createError.value = err instanceof ApiError ? err.message : 'Não foi possível salvar o gasto.';
  } finally {
    creating.value = false;
  }
}

// --- Marcar como pago ---
const payingId = ref<string | null>(null);
async function onMarkPaid(expense: Expense) {
  payingId.value = expense.id;
  try {
    const { expense: updated } = await markExpensePaid(expense.id, toLocalDateKey(new Date()));
    const idx = expenses.value.findIndex((e) => e.id === expense.id);
    if (idx !== -1) expenses.value[idx] = updated;
    loadToday();
  } catch {
    // mantém pendente para nova tentativa
  } finally {
    payingId.value = null;
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
    loadToday();
  } catch {
    // mantém na lista para nova tentativa
  } finally {
    deletingId.value = null;
  }
}

// --- DRE ---
function startOfMonthKey(date: Date) {
  return toLocalDateKey(new Date(date.getFullYear(), date.getMonth(), 1));
}
function endOfMonthKey(date: Date) {
  return toLocalDateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

const now = new Date();
const dreFrom = ref(startOfMonthKey(now));
const dreTo = ref(endOfMonthKey(now));
const dre = ref<DreReport | null>(null);
const dreLoading = ref(false);
const dreError = ref<string | null>(null);

async function loadDre() {
  dreLoading.value = true;
  dreError.value = null;
  try {
    dre.value = await fetchDre(dreFrom.value, dreTo.value);
  } catch {
    dreError.value = 'Não foi possível gerar o DRE para o período selecionado.';
  } finally {
    dreLoading.value = false;
  }
}

function selectDrePreset(preset: 'this-month' | 'last-month' | 'this-year') {
  const ref_ = new Date();
  if (preset === 'this-month') {
    dreFrom.value = startOfMonthKey(ref_);
    dreTo.value = endOfMonthKey(ref_);
  } else if (preset === 'last-month') {
    const prev = new Date(ref_.getFullYear(), ref_.getMonth() - 1, 1);
    dreFrom.value = startOfMonthKey(prev);
    dreTo.value = endOfMonthKey(prev);
  } else {
    dreFrom.value = toLocalDateKey(new Date(ref_.getFullYear(), 0, 1));
    dreTo.value = toLocalDateKey(new Date(ref_.getFullYear(), 11, 31));
  }
  loadDre();
}

watch(activeTab, (tab) => {
  if (tab === 'dre' && !dre.value) loadDre();
});

const maxDreCategoryCents = computed(() => Math.max(1, ...(dre.value?.expensesByCategory.map((c) => c.totalCents) ?? [])));
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
          <p>Gastos, DRE e conciliação bancária da clínica.</p>
        </div>
      </div>
    </div>

    <div class="admin-finance__tabs" role="tablist">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        type="button"
        role="tab"
        class="admin-finance__tab"
        :class="{ 'admin-finance__tab--active': activeTab === tab.key }"
        :aria-selected="activeTab === tab.key"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- ================= VISÃO GERAL ================= -->
    <div v-if="activeTab === 'overview'">
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
            <span class="admin-finance__stat-label">Gastos pagos este mês</span>
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
        <div class="admin-finance__stat admin-finance__stat--due">
          <span class="admin-finance__stat-icon admin-finance__stat-icon--danger">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
          </span>
          <div>
            <span class="admin-finance__stat-label">Vencimentos de hoje</span>
            <strong class="admin-finance__stat-value">{{ todayLoading ? '…' : formatCurrency(today?.vencimentosHojeCents ?? 0) }}</strong>
          </div>
        </div>
        <div class="admin-finance__stat admin-finance__stat--received">
          <span class="admin-finance__stat-icon admin-finance__stat-icon--success">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v14M6 11l6 6 6-6" /><path d="M5 21h14" /></svg>
          </span>
          <div>
            <span class="admin-finance__stat-label">Recebimentos de hoje</span>
            <strong class="admin-finance__stat-value">{{ todayLoading ? '…' : formatCurrency(today?.recebimentosHojeCents ?? 0) }}</strong>
          </div>
        </div>
      </div>

      <div v-if="!todayLoading && today && (today.vencimentosHoje.length || today.recebimentosHoje.length)" class="admin-finance__today-grid">
        <div v-if="today.vencimentosHoje.length" class="admin-card admin-finance__today-card">
          <h3 class="admin-finance__today-title admin-finance__today-title--danger">Contas vencendo hoje</h3>
          <ul class="admin-finance__today-list">
            <li v-for="e in today.vencimentosHoje" :key="e.id">
              <span>{{ e.description }}</span>
              <strong>{{ formatCurrency(e.amountCents) }}</strong>
            </li>
          </ul>
        </div>
        <div v-if="today.recebimentosHoje.length" class="admin-card admin-finance__today-card">
          <h3 class="admin-finance__today-title admin-finance__today-title--success">Atendimentos concluídos hoje</h3>
          <ul class="admin-finance__today-list">
            <li v-for="a in today.recebimentosHoje" :key="a.id">
              <span>{{ a.customerName }} · {{ a.serviceName }}</span>
              <strong>{{ formatCurrency(a.amountCents) }}</strong>
            </li>
          </ul>
        </div>
      </div>

      <div class="admin-card admin-finance__revenue-card">
        <div class="admin-finance__revenue-header">
          <h2>
            <span class="admin-card__icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18M7 15l4-5 3 3 5-7" /></svg>
            </span>
            Faturamento diário (últimos 30 dias)
          </h2>
          <div v-if="revenueHistory" class="admin-finance__revenue-avg">
            <span>Média por dia com atendimento</span>
            <strong>{{ formatCurrency(revenueHistory.averageCents) }}</strong>
          </div>
        </div>
        <LoadingState v-if="revenueLoading" label="Carregando histórico…" />
        <BarChart
          v-else-if="revenueHistory"
          :data="revenueChartData"
          color="var(--chart-seq-500)"
          :value-formatter="(v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })"
        />
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
            <AdminSelect v-model="form.category" :options="categoryOptions" />
          </label>
        </div>
        <div class="admin-form-row">
          <label class="admin-field admin-field--small">
            Valor (R$)
            <input v-model="form.amountInput" type="text" placeholder="0,00" required />
          </label>
          <label class="admin-field admin-field--small">
            Situação
            <AdminSelect v-model="form.status" :options="statusOptions" />
          </label>
          <label v-if="form.status === 'PAID'" class="admin-field admin-field--date">
            Data do pagamento
            <AdminDatePicker v-model="form.paidAt" />
          </label>
          <label v-else class="admin-field admin-field--date">
            Vencimento
            <AdminDatePicker v-model="form.dueAt" />
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

      <Transition name="fade-swap">
      <LoadingState v-if="loading" key="loading" label="Carregando gastos…" />
      <EmptyState v-else-if="error" key="error" title="Algo deu errado" :description="error" action-label="Tentar novamente" @action="load" />
      <EmptyState v-else-if="!expenses.length" key="empty" title="Nenhum gasto cadastrado ainda." />

      <ul v-else key="content" class="admin-finance__list">
        <li v-for="expense in expenses" :key="expense.id" class="admin-card admin-finance__row" :class="{ 'admin-finance__row--pending': expense.status === 'PENDING' }">
          <div class="admin-finance__info">
            <span class="admin-finance__description">
              {{ expense.description }}
              <span v-if="expense.status === 'PENDING'" class="admin-finance__badge admin-finance__badge--pending">Pendente</span>
            </span>
            <span class="admin-finance__meta">
              <span class="admin-finance__category-dot" :style="{ background: CATEGORY_COLORS[expense.category] }" />
              {{ CATEGORY_LABELS[expense.category] }}
              <template v-if="expense.status === 'PAID' && expense.paidAt"> · pago em {{ formatDate(expense.paidAt) }}</template>
              <template v-else-if="expense.dueAt"> · vence em {{ formatDate(expense.dueAt) }}</template>
            </span>
            <span v-if="expense.notes" class="admin-finance__notes">{{ expense.notes }}</span>
          </div>
          <div class="admin-finance__actions">
            <span class="admin-finance__amount">{{ formatCurrency(expense.amountCents) }}</span>
            <button
              v-if="expense.status === 'PENDING'"
              type="button"
              class="admin-link-btn"
              :disabled="payingId === expense.id"
              @click="onMarkPaid(expense)"
            >
              Marcar como pago
            </button>
            <button type="button" class="admin-link-btn admin-link-btn--danger" :disabled="deletingId === expense.id" @click="onDelete(expense)">
              Excluir
            </button>
          </div>
        </li>
      </ul>
      </Transition>
    </div>

    <!-- ================= DRE ================= -->
    <div v-else-if="activeTab === 'dre'" class="admin-card admin-finance__dre">
      <h2>
        <span class="admin-card__icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4v16h16" /><path d="M8 15l3-4 3 2 4-6" /></svg>
        </span>
        DRE — Demonstração do Resultado
      </h2>
      <p class="admin-finance__dre-hint">
        Regime de caixa: soma atendimentos concluídos (receita) e gastos já pagos (despesas) dentro do período — sem projeções.
      </p>

      <div class="admin-finance__dre-controls">
        <div class="admin-finance__dre-presets">
          <button type="button" class="button button--ghost" @click="selectDrePreset('this-month')">Este mês</button>
          <button type="button" class="button button--ghost" @click="selectDrePreset('last-month')">Mês passado</button>
          <button type="button" class="button button--ghost" @click="selectDrePreset('this-year')">Este ano</button>
        </div>
        <div class="admin-form-row">
          <label class="admin-field admin-field--date">
            De
            <AdminDatePicker v-model="dreFrom" />
          </label>
          <label class="admin-field admin-field--date">
            Até
            <AdminDatePicker v-model="dreTo" />
          </label>
          <button type="button" class="button button--primary" :disabled="dreLoading" @click="loadDre">
            {{ dreLoading ? 'Gerando…' : 'Gerar DRE' }}
          </button>
        </div>
      </div>

      <LoadingState v-if="dreLoading" label="Calculando DRE…" />
      <EmptyState v-else-if="dreError" title="Algo deu errado" :description="dreError" action-label="Tentar novamente" @action="loadDre" />
      <div v-else-if="dre" class="admin-finance__dre-report">
        <div class="admin-finance__dre-line admin-finance__dre-line--revenue">
          <span>Receita bruta</span>
          <strong>{{ formatCurrency(dre.revenueCents) }}</strong>
        </div>

        <div class="admin-finance__dre-categories">
          <div v-for="c in dre.expensesByCategory" :key="c.category" class="admin-finance__dre-cat-row">
            <span class="admin-finance__category-dot" :style="{ background: CATEGORY_COLORS[c.category] }" />
            <span class="admin-finance__dre-cat-label">{{ c.label }}</span>
            <span class="admin-finance__dre-cat-bar-track">
              <span class="admin-finance__dre-cat-bar" :style="{ width: `${(c.totalCents / maxDreCategoryCents) * 100}%`, background: CATEGORY_COLORS[c.category] }" />
            </span>
            <span class="admin-finance__dre-cat-value">{{ formatCurrency(c.totalCents) }}</span>
          </div>
          <p v-if="!dre.expensesByCategory.length" class="admin-finance__dre-empty">Nenhum gasto pago neste período.</p>
        </div>

        <div class="admin-finance__dre-line">
          <span>(–) Despesas totais</span>
          <strong>{{ formatCurrency(dre.totalExpensesCents) }}</strong>
        </div>

        <div class="admin-finance__dre-line admin-finance__dre-line--result" :class="{ 'admin-finance__dre-line--negative': dre.netResultCents < 0 }">
          <span>= Resultado líquido</span>
          <strong>
            {{ formatCurrency(dre.netResultCents) }}
            <small v-if="dre.marginPct !== null">({{ dre.marginPct }}% de margem)</small>
          </strong>
        </div>
      </div>
    </div>

    <!-- ================= CONCILIAÇÃO BANCÁRIA ================= -->
    <AdminBankReconciliation v-else-if="activeTab === 'bank'" />
  </div>
</template>

<style scoped>
.admin-finance__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-5);
}

.admin-finance__title {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.admin-finance__header p {
  color: var(--color-ink-muted);
}

.admin-finance__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-6);
}

.admin-finance__tab {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-ink-muted);
  font-weight: 600;
  font-size: 0.88rem;
  padding: 9px 18px;
  border-radius: var(--radius-pill);
  min-height: var(--touch-target-min);
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard), background var(--duration-fast) var(--ease-standard);
}

.admin-finance__tab:hover {
  border-color: var(--color-rose-300);
  color: var(--color-rose-700);
}

.admin-finance__tab--active {
  background: linear-gradient(135deg, var(--color-rose-700), var(--color-rose-900));
  border-color: transparent;
  color: #fff;
}

.admin-finance__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-3);
  margin-bottom: var(--space-5);
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

.admin-finance__stat-icon--danger {
  background: color-mix(in srgb, var(--color-danger) 14%, transparent);
  color: var(--color-danger);
}

.admin-finance__stat-icon--success {
  background: color-mix(in srgb, var(--color-success) 14%, transparent);
  color: var(--color-success);
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

.admin-finance__today-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--space-3);
  margin-bottom: var(--space-5);
}

.admin-finance__today-title {
  font-size: 0.95rem;
  margin-bottom: var(--space-3);
}

.admin-finance__today-title--danger {
  color: var(--color-danger);
}

.admin-finance__today-title--success {
  color: var(--color-success);
}

.admin-finance__today-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.admin-finance__today-list li {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  font-size: 0.9rem;
}

.admin-finance__today-list strong {
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.admin-finance__revenue-card {
  margin-bottom: var(--space-6);
}

.admin-finance__revenue-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.admin-finance__revenue-header h2 {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1.1rem;
}

.admin-finance__revenue-avg {
  text-align: right;
  font-size: 0.82rem;
  color: var(--color-ink-muted);
}

.admin-finance__revenue-avg strong {
  display: block;
  font-family: var(--font-display);
  font-size: 1.1rem;
  color: var(--color-rose-700);
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

.admin-finance__category-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 2px;
  vertical-align: middle;
  flex-shrink: 0;
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

/* Aparência (tipografia, borda, fundo, foco, setinha do select) é
   compartilhada — ver .admin-field em styles/global.css. Aqui fica só o
   dimensionamento específico deste formulário dentro do layout flex-wrap. */
.admin-field {
  flex: 1;
  min-width: 160px;
}

.admin-field--small {
  flex: 0 0 140px;
  min-width: 120px;
}

/* Variante pros campos que envolvem um AdminDatePicker: o gatilho dele
   ("📅 01/09/2026") precisa de ~158px pra caber sem vazar (ver comentário em
   AdminDatePicker.vue) — os 140px rígidos de .admin-field--small (pensados
   pra um <input>/<select> comum, que respeitam a própria caixa à risca)
   deixavam esse conteúdo mais largo vazar visualmente por cima do botão
   "Gerar DRE" ao lado, sem nunca disparar a quebra de linha do flex-wrap
   (que só reage ao tamanho DECLARADO do item, não ao overflow visual do
   conteúdo). flex-basis:auto (em vez de um pixel fixo) faz o item refletir
   de verdade a largura mínima do filho, permitindo o wrap acontecer quando
   necessário. */
.admin-field--date {
  flex: 0 1 auto;
  min-width: 158px;
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
  transition: transform var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard);
}

.admin-finance__row:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
  border-color: var(--color-rose-300);
}

.admin-finance__row--pending {
  border-color: color-mix(in srgb, var(--color-gold-500) 45%, var(--color-border));
}

.admin-finance__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.admin-finance__description {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  color: var(--color-ink);
}

.admin-finance__badge {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 9px;
  border-radius: var(--radius-pill);
}

.admin-finance__badge--pending {
  background: var(--color-gold-100);
  color: var(--color-gold-700);
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

/* --- DRE --- */
.admin-finance__dre h2 {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1.15rem;
  margin-bottom: var(--space-2);
}

.admin-finance__dre-hint {
  color: var(--color-ink-muted);
  font-size: 0.88rem;
  margin-bottom: var(--space-4);
}

.admin-finance__dre-controls {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-bottom: var(--space-5);
  margin-bottom: var(--space-5);
  border-bottom: 1px solid var(--color-border);
}

.admin-finance__dre-presets {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.admin-finance__dre-presets .button {
  padding: 8px 16px;
  font-size: 0.85rem;
}

.admin-finance__dre-report {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.admin-finance__dre-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--color-ink);
}

.admin-finance__dre-line--revenue strong {
  color: var(--color-success);
}

.admin-finance__dre-line--result {
  padding-top: var(--space-3);
  border-top: 2px solid var(--color-border);
  font-size: 1.2rem;
  font-family: var(--font-display);
}

.admin-finance__dre-line--result strong {
  color: var(--color-success);
}

.admin-finance__dre-line--result.admin-finance__dre-line--negative strong {
  color: var(--color-danger);
}

.admin-finance__dre-line--result small {
  font-size: 0.6em;
  font-weight: 500;
  margin-left: 6px;
  color: var(--color-ink-muted);
}

.admin-finance__dre-categories {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  background: var(--color-bg);
  border-radius: var(--radius-sm);
}

.admin-finance__dre-cat-row {
  display: grid;
  grid-template-columns: 8px 90px 1fr auto;
  align-items: center;
  gap: var(--space-3);
  font-size: 0.85rem;
}

.admin-finance__dre-cat-label {
  color: var(--color-ink-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.admin-finance__dre-cat-bar-track {
  height: 8px;
  border-radius: var(--radius-pill);
  background: var(--color-border);
  overflow: hidden;
}

.admin-finance__dre-cat-bar {
  display: block;
  height: 100%;
  border-radius: var(--radius-pill);
  transition: width var(--duration-slow) var(--ease-premium);
}

.admin-finance__dre-cat-value {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.admin-finance__dre-empty {
  color: var(--color-ink-soft);
  font-size: 0.85rem;
  font-style: italic;
}

@media (max-width: 640px) {
  .admin-finance__dre-cat-row {
    grid-template-columns: 8px 1fr auto;
  }
  .admin-finance__dre-cat-bar-track {
    display: none;
  }
}
</style>
