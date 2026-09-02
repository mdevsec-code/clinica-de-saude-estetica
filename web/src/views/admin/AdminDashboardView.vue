<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { RouterLink } from 'vue-router';
import { ApiError } from '@/services/api';
import { fetchDashboardStats } from '@/services/admin-dashboard.service';
import { fetchAppointments } from '@/services/admin-appointments.service';
import { applyScrollReveal } from '@/composables/useScrollReveal';
import { refreshScroll } from '@/composables/useSmoothScroll';
import { dayLabel, endOfDay, startOfDay, toLocalDateKey } from '@/utils/calendar';
import type { AdminAppointment, AppointmentStatus, DashboardStats } from '@/types';
import BarChart from '@/components/admin/BarChart.vue';
import CategoryBarList from '@/components/admin/CategoryBarList.vue';
import DonutChart from '@/components/admin/DonutChart.vue';
import RadialProgress from '@/components/admin/RadialProgress.vue';
import DayAppointmentList from '@/components/admin/DayAppointmentList.vue';
import AdminDatePicker from '@/components/admin/AdminDatePicker.vue';
import LoadingState from '@/components/LoadingState.vue';
import EmptyState from '@/components/EmptyState.vue';

const router = useRouter();
const stats = ref<DashboardStats | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

// Janela do gráfico "Agendamentos por dia" — a pessoa escolhe entre estas
// opções em vez de um período fixo de 14 dias (o resto do painel continua no
// mês corrente, só este gráfico muda de janela).
const CHART_RANGE_OPTIONS = [7, 14, 30, 60, 90] as const;
const chartDays = ref<number>(14);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    stats.value = await fetchDashboardStats(chartDays.value);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      router.push({ name: 'admin-login' });
      return;
    }
    error.value = 'Não foi possível carregar o painel. Tente novamente.';
  } finally {
    loading.value = false;
  }
}

function selectChartRange(days: number) {
  if (chartDays.value === days) return;
  chartDays.value = days;
  load();
}

onMounted(load);

// Data por extenso pro subtítulo do hero (ex.: "Terça-feira, 01 de setembro
// de 2026") — reaproveita o mesmo formatador já usado no dia-inspecionado
// abaixo, só que fixo em "hoje" em vez de vir de um input.
const todayLabel = computed(() => dayLabel(new Date()));

// --- Inspecionar um dia específico: campo de data livre (qualquer dia, não
// só os do gráfico acima) que busca os agendamentos reais daquele dia via o
// mesmo endpoint já usado na Agenda — nenhuma lógica nova no backend para
// isso, só reaproveita /appointments?from&to com o range de um único dia. ---
const inspectDateKey = ref(toLocalDateKey(new Date()));
const dayAppointments = ref<AdminAppointment[]>([]);
const dayLoading = ref(false);
const dayLoaded = ref(false);
const dayError = ref<string | null>(null);

async function inspectDay() {
  if (!inspectDateKey.value) return;
  dayLoading.value = true;
  dayError.value = null;
  try {
    const reference = new Date(`${inspectDateKey.value}T12:00:00`);
    const { appointments } = await fetchAppointments({
      from: startOfDay(reference).toISOString(),
      to: endOfDay(reference).toISOString(),
    });
    dayAppointments.value = appointments.sort((a, b) => a.startAt.localeCompare(b.startAt));
    dayLoaded.value = true;
  } catch {
    dayError.value = 'Não foi possível carregar os agendamentos deste dia.';
  } finally {
    dayLoading.value = false;
  }
}

const inspectDayTitle = computed(() => dayLabel(new Date(`${inspectDateKey.value}T12:00:00`)));
const inspectDaySummary = computed(() => {
  const counts: Record<AppointmentStatus, number> = { CONFIRMED: 0, COMPLETED: 0, CANCELLED: 0, NO_SHOW: 0 };
  for (const appt of dayAppointments.value) counts[appt.status]++;
  return counts;
});

// Os cards de KPI (data-reveal) só existem no DOM depois que `stats` resolve
// e o <Transition mode="out-in"> troca LoadingState pelo conteúdo real — um
// nextTick() logo após `loading.value = false` (como em HomeView/ContactView)
// NÃO basta aqui: com mode="out-in", a inserção real do bloco de conteúdo só
// acontece depois que a transição de SAÍDA do LoadingState termina (a
// própria mecânica do modo out-in), o que só é resolvido bem depois do
// nextTick — então o scan de [data-reveal] rodava contra um container ainda
// sem os cards, e eles ficavam presos em opacity:0 (regra global) para
// sempre. @after-enter do Transition dispara exatamente quando o elemento
// que entrou (LoadingState, EmptyState OU o conteúdo real) já está no DOM —
// rodar o scan sempre é inofensivo nos dois primeiros casos (não há
// [data-reveal] neles) e resolve o caso que importa.
function onContentEnter() {
  applyScrollReveal('.admin-dashboard');
  refreshScroll();
}

function formatCurrency(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const chartData = computed(() => {
  if (!stats.value) return [];
  return stats.value.appointmentsPerDay.map((d) => ({
    label: String(Number(d.date.slice(8, 10))),
    value: d.count,
  }));
});

const STATUS_META: Record<AppointmentStatus, { label: string; color: string }> = {
  CONFIRMED: { label: 'Confirmados', color: 'var(--color-rose-700)' },
  COMPLETED: { label: 'Concluídos', color: 'var(--color-success)' },
  CANCELLED: { label: 'Cancelados', color: 'var(--color-ink-soft)' },
  NO_SHOW: { label: 'Não compareceu', color: 'var(--color-danger)' },
};
const STATUS_ORDER: AppointmentStatus[] = ['CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

const statusRows = computed(() => {
  if (!stats.value) return [];
  const byStatus = new Map(stats.value.appointmentStatusBreakdown.map((s) => [s.status, s.count]));
  return STATUS_ORDER.map((status) => ({ status, count: byStatus.get(status) ?? 0, ...STATUS_META[status] }));
});

// Variação vs. mês anterior: a seta sempre aponta na direção real do número
// (subiu/desceu); a cor é que muda de sentido conforme a métrica — receita
// subindo é bom (verde), gasto subindo é ruim (vermelho) — para não mandar
// uma leitura errada só porque os dois usam a mesma seta para cima.
const revenueTrend = computed(() => {
  const pct = stats.value?.revenueChangePct;
  if (pct == null) return null;
  return { pct, good: pct >= 0 };
});
const expensesTrend = computed(() => {
  const pct = stats.value?.expensesChangePct;
  if (pct == null) return null;
  return { pct, good: pct <= 0 };
});

const maxServiceCount = computed(() => Math.max(1, ...(stats.value?.topServices.map((s) => s.count) ?? [])));

const revenueVsExpenses = computed(() => {
  if (!stats.value) return null;
  const max = Math.max(1, stats.value.revenueThisMonthCents, stats.value.expensesThisMonthCents);
  return {
    revenuePct: (stats.value.revenueThisMonthCents / max) * 100,
    expensesPct: (stats.value.expensesThisMonthCents / max) * 100,
  };
});

function formatUpcoming(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Bahia' });
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bahia' });
  return `${date} · ${time}`;
}
</script>

<template>
  <div class="admin-dashboard">
    <!-- Hero: substitui o antigo cabeçalho "ícone + título + linha muda" por
         uma faixa com presença real — o mesmo tratamento de gradiente rosé +
         glow usado no site público (hero__glow/cta-final__glow), mas parado
         (glow em drift bem lento, sem loop chamativo) porque isto é uma
         ferramenta de trabalho, não uma página de marketing. Ela existe FORA
         do <Transition> de loading/erro (assim como o header antigo) e não
         leva data-reveal: precisa estar visível desde o primeiro render, não
         escondida em opacity:0 até o scroll-reveal rodar depois que os dados
         chegarem. O número em destaque (atendimentos de hoje) é a ÚNICA
         coisa que esse bloco existe pra comunicar de cara — todo o resto
         (mês, receita, gastos...) vem depois, na grade de KPIs, como
         detalhe de apoio. -->
    <header class="admin-dashboard__hero">
      <span class="admin-dashboard__hero-glow" aria-hidden="true" />
      <div class="admin-dashboard__hero-intro">
        <span class="admin-page-icon">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>
        </span>
        <div>
          <h1>Painel</h1>
          <p>{{ todayLabel }}</p>
        </div>
      </div>
      <div class="admin-dashboard__hero-stat">
        <span class="admin-dashboard__hero-stat-label">Atendimentos hoje</span>
        <span class="admin-dashboard__hero-stat-value">{{ stats ? stats.appointmentsToday : '–' }}</span>
        <span class="admin-dashboard__hero-stat-hint">confirmados para hoje</span>
      </div>
    </header>

    <Transition name="fade-swap" @after-enter="onContentEnter">
    <LoadingState v-if="loading" key="loading" label="Carregando painel…" />
    <EmptyState v-else-if="error" key="error" title="Algo deu errado" :description="error" action-label="Tentar novamente" @action="load" />

    <div v-else-if="stats" key="content">
      <div class="admin-dashboard__kpis">
        <div class="kpi-card" data-reveal>
          <span class="kpi-card__icon">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
          </span>
          <span class="kpi-card__label">Este mês</span>
          <span class="kpi-card__value">{{ stats.appointmentsThisMonth }}</span>
          <span class="kpi-card__hint">agendamentos no total</span>
        </div>
        <div class="kpi-card kpi-card--accent" data-reveal>
          <span class="kpi-card__icon kpi-card__icon--on-accent">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8M15 7h6v6" /></svg>
          </span>
          <span class="kpi-card__label">Receita do mês</span>
          <span class="kpi-card__value">{{ formatCurrency(stats.revenueThisMonthCents) }}</span>
          <span v-if="revenueTrend" class="kpi-trend kpi-trend--on-accent">
            <span aria-hidden="true">{{ revenueTrend.pct >= 0 ? '▲' : '▼' }}</span>
            {{ Math.abs(revenueTrend.pct) }}% vs. mês passado
          </span>
          <span v-else class="kpi-card__hint">atendimentos concluídos</span>
        </div>
        <div class="kpi-card" data-reveal>
          <span class="kpi-card__icon">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 17l-6-6-4 4-8-8M9 7H3v6" /></svg>
          </span>
          <span class="kpi-card__label">Gastos do mês</span>
          <span class="kpi-card__value">{{ formatCurrency(stats.expensesThisMonthCents) }}</span>
          <span v-if="expensesTrend" class="kpi-trend" :class="expensesTrend.good ? 'kpi-trend--good' : 'kpi-trend--bad'">
            <span aria-hidden="true">{{ expensesTrend.pct >= 0 ? '▲' : '▼' }}</span>
            {{ Math.abs(expensesTrend.pct) }}% vs. mês passado
          </span>
          <span v-else class="kpi-card__hint">gastos cadastrados</span>
        </div>
        <div class="kpi-card" :class="{ 'kpi-card--negative': stats.balanceThisMonthCents < 0 }" data-reveal>
          <span class="kpi-card__icon">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18M7 7H5.5a2.5 2.5 0 0 0 0 5h5a2.5 2.5 0 0 1 0 5H8" /></svg>
          </span>
          <span class="kpi-card__label">Saldo do mês</span>
          <span class="kpi-card__value">{{ formatCurrency(stats.balanceThisMonthCents) }}</span>
          <span class="kpi-card__hint">receita − gastos</span>
        </div>
        <!-- Único cartão com o acento dourado (--color-gold-*): reservado, por
             convenção do design system (ver tokens.css), pra um único "momento
             premium" por tela — aqui, o ticket médio, por ser a métrica de
             qualidade/posicionamento do atendimento, não só de volume. -->
        <div class="kpi-card kpi-card--gold" data-reveal>
          <span class="kpi-card__icon kpi-card__icon--gold">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 12.5 12.5 20.5a2 2 0 0 1-2.83 0l-6.17-6.17a2 2 0 0 1 0-2.83L11.5 3.5H19a1.5 1.5 0 0 1 1.5 1.5Z" /><circle cx="15.5" cy="8.5" r="1.25" fill="currentColor" stroke="none" /></svg>
          </span>
          <span class="kpi-card__label">Ticket médio</span>
          <span class="kpi-card__value">{{ formatCurrency(stats.avgTicketCents) }}</span>
          <span class="kpi-card__hint">por atendimento concluído</span>
        </div>
        <div class="kpi-card kpi-card--ring" data-reveal>
          <RadialProgress :value="stats.completionRatePct" :size="60" />
          <div class="kpi-card--ring__text">
            <span class="kpi-card__label">Taxa de conclusão</span>
            <span class="kpi-card__hint">
              {{ stats.noShowRatePct != null ? `${stats.noShowRatePct}% não compareceram` : 'sem atendimentos finalizados' }}
            </span>
          </div>
        </div>
        <!-- Ponto pulsante no canto: a borda vermelha sozinha (tratamento
             anterior) só aparece se a pessoa já estiver olhando pro card —
             o ponto dá um sinal de "isto pede atenção" perceptível mesmo em
             leitura rápida da grade inteira. Estático (sem o pulse) sob
             prefers-reduced-motion, ver bloco de motion no fim do <style>. -->
        <RouterLink :to="{ name: 'admin-inventory' }" class="kpi-card kpi-card--link" :class="{ 'kpi-card--warning': stats.lowStockCount > 0 }" data-reveal>
          <span v-if="stats.lowStockCount > 0" class="kpi-card__alert-dot" aria-hidden="true" />
          <span class="kpi-card__icon" :class="{ 'kpi-card__icon--warning': stats.lowStockCount > 0 }">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9.5 12 4l9 5.5V19a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z" /></svg>
          </span>
          <span class="kpi-card__label">Estoque baixo</span>
          <span class="kpi-card__value">{{ stats.lowStockCount }}</span>
          <span class="kpi-card__hint">{{ stats.lowStockCount ? 'itens precisam de reposição' : 'tudo em dia' }}</span>
        </RouterLink>
      </div>

      <!-- admin-card--feature vs. sem modificador: os três cartões de
           análise/ferramenta (gráfico, status, inspecionar dia) recebem mais
           peso visual (fita superior sempre visível, fundo com leve
           gradiente) — os cartões de listagem de apoio (receita x gastos,
           categorias, estoque, próximos, top serviços) ficam mais enxutos
           (menos padding, título menor, fita só no hover, como antes). Isso
           cria hierarquia por TIPO de conteúdo, não só por número. -->
      <div class="admin-dashboard__grid">
        <div class="admin-card admin-card--chart admin-card--feature">
          <div class="admin-card__head">
            <h2>
              <span class="admin-card__icon">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18M7 16l4-6 3 3 5-8" /></svg>
              </span>
              Agendamentos — últimos {{ chartDays }} dias
            </h2>
            <div class="chart-range" role="group" aria-label="Período do gráfico">
              <button
                v-for="opt in CHART_RANGE_OPTIONS"
                :key="opt"
                type="button"
                class="chart-range__btn"
                :class="{ 'chart-range__btn--active': chartDays === opt }"
                @click="selectChartRange(opt)"
              >
                {{ opt }}d
              </button>
            </div>
          </div>
          <BarChart :data="chartData" />
        </div>

        <div class="admin-card admin-card--feature">
          <h2>
            <span class="admin-card__icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
            </span>
            Status dos agendamentos (mês)
          </h2>
          <div class="status-donut">
            <DonutChart :data="statusRows.map((r) => ({ label: r.label, value: r.count, color: r.color }))" center-label="total" :size="140" />
            <ul class="status-list">
              <li v-for="row in statusRows" :key="row.status" class="status-list__row">
                <span class="status-list__dot" :style="{ background: row.color }" />
                <span class="status-list__label">{{ row.label }}</span>
                <span class="status-list__count">{{ row.count }}</span>
              </li>
            </ul>
          </div>
        </div>

        <div class="admin-card admin-card--chart admin-card--inspector admin-card--feature">
          <div class="admin-card__head">
            <h2>
              <span class="admin-card__icon">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              </span>
              Inspecionar um dia
            </h2>
            <form class="day-inspector__form" @submit.prevent="inspectDay">
              <AdminDatePicker v-model="inspectDateKey" />
              <button type="submit" class="button button--primary" :disabled="dayLoading">
                {{ dayLoading ? 'Buscando…' : 'Ver dia' }}
              </button>
            </form>
          </div>

          <p v-if="dayError" class="admin-error">{{ dayError }}</p>

          <template v-if="dayLoaded && !dayLoading">
            <div class="day-inspector__summary">
              <span class="day-inspector__title">{{ inspectDayTitle }}</span>
              <span class="day-inspector__total">{{ dayAppointments.length }} agendamento(s)</span>
              <span class="day-inspector__badges">
                <span class="admin-badge admin-badge--confirmed">{{ inspectDaySummary.CONFIRMED }} confirmados</span>
                <span class="admin-badge admin-badge--completed">{{ inspectDaySummary.COMPLETED }} concluídos</span>
                <span class="admin-badge admin-badge--cancelled">{{ inspectDaySummary.CANCELLED }} cancelados</span>
                <span class="admin-badge admin-badge--no_show">{{ inspectDaySummary.NO_SHOW }} faltas</span>
              </span>
            </div>
            <DayAppointmentList :appointments="dayAppointments" />
          </template>
          <p v-else-if="!dayLoading" class="admin-dashboard__empty-hint">Escolha uma data e clique em "Ver dia" para ver os agendamentos detalhados daquele dia.</p>
        </div>

        <div v-if="revenueVsExpenses" class="admin-card admin-card--list">
          <h2>
            <span class="admin-card__icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            </span>
            Receita x Gastos (mês)
          </h2>
          <div class="rev-exp">
            <div class="rev-exp__row">
              <span class="rev-exp__label">Receita</span>
              <div class="rev-exp__track">
                <div class="rev-exp__fill rev-exp__fill--revenue" :style="{ width: `${revenueVsExpenses.revenuePct}%` }" />
              </div>
              <span class="rev-exp__value">{{ formatCurrency(stats.revenueThisMonthCents) }}</span>
            </div>
            <div class="rev-exp__row">
              <span class="rev-exp__label">Gastos</span>
              <div class="rev-exp__track">
                <div class="rev-exp__fill rev-exp__fill--expenses" :style="{ width: `${revenueVsExpenses.expensesPct}%` }" />
              </div>
              <span class="rev-exp__value">{{ formatCurrency(stats.expensesThisMonthCents) }}</span>
            </div>
          </div>
        </div>

        <div class="admin-card admin-card--list">
          <h2>
            <span class="admin-card__icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" /></svg>
            </span>
            Gastos por categoria (mês)
          </h2>
          <CategoryBarList v-if="stats.expensesByCategory.length" :data="stats.expensesByCategory" />
          <div v-else class="admin-card__empty">
            <span class="admin-card__empty-icon">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l2-5h14l2 5M3 9v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9M3 9h18M9 13h6" /></svg>
            </span>
            <p>Nenhum gasto cadastrado este mês.</p>
          </div>
        </div>

        <div class="admin-card admin-card--list">
          <h2>
            <span class="admin-card__icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9.5 12 4l9 5.5V19a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z" /></svg>
            </span>
            Estoque baixo
          </h2>
          <ul v-if="stats.lowStockItems.length" class="low-stock-list">
            <li v-for="item in stats.lowStockItems" :key="item.id" class="low-stock-list__row">
              <span>{{ item.name }}</span>
              <span class="low-stock-list__qty">{{ item.quantity }}{{ item.unit }} / mín. {{ item.minQuantity }}{{ item.unit }}</span>
            </li>
          </ul>
          <!-- Ícone de check em vez do "caixa vazia" genérico: aqui a ausência
               de itens é uma notícia BOA (nada abaixo do mínimo), não uma
               falta de dado — o ícone deve refletir isso. -->
          <div v-else class="admin-card__empty admin-card__empty--success">
            <span class="admin-card__empty-icon admin-card__empty-icon--success">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 5-5" /></svg>
            </span>
            <p>Nenhum item abaixo do mínimo cadastrado.</p>
          </div>
        </div>

        <div class="admin-card admin-card--list">
          <h2>
            <span class="admin-card__icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
            </span>
            Próximos agendamentos
          </h2>
          <ul v-if="stats.upcomingAppointments.length" class="upcoming-list">
            <li v-for="appt in stats.upcomingAppointments" :key="appt.id" class="upcoming-list__row">
              <span class="upcoming-list__when">{{ formatUpcoming(appt.startAt) }}</span>
              <span class="upcoming-list__info">
                <span class="upcoming-list__name">{{ appt.customerName }}</span>
                <span class="upcoming-list__service">{{ appt.serviceName }}</span>
              </span>
            </li>
          </ul>
          <div v-else class="admin-card__empty">
            <span class="admin-card__empty-icon">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l2-5h14l2 5M3 9v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9M3 9h18M9 13h6" /></svg>
            </span>
            <p>Nenhum agendamento confirmado pela frente.</p>
          </div>
        </div>

        <div class="admin-card admin-card--list">
          <h2>
            <span class="admin-card__icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4M17 3H7a2 2 0 0 0-2 2v4a7 7 0 0 0 14 0V5a2 2 0 0 0-2-2Z" /><path d="M5 6H3a2 2 0 0 0 0 4h2M19 6h2a2 2 0 0 1 0 4h-2" /></svg>
            </span>
            Serviços mais procurados (mês)
          </h2>
          <ul v-if="stats.topServices.length" class="top-services-list">
            <li v-for="(service, i) in stats.topServices" :key="service.id" class="top-services-list__row">
              <span class="top-services-list__rank">{{ i + 1 }}</span>
              <span class="top-services-list__name">{{ service.name }}</span>
              <div class="top-services-list__track">
                <div class="top-services-list__fill" :style="{ width: `${(service.count / maxServiceCount) * 100}%` }" />
              </div>
              <span class="top-services-list__count">{{ service.count }}</span>
            </li>
          </ul>
          <div v-else class="admin-card__empty">
            <span class="admin-card__empty-icon">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l2-5h14l2 5M3 9v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9M3 9h18M9 13h6" /></svg>
            </span>
            <p>Nenhum agendamento cadastrado este mês.</p>
          </div>
        </div>
      </div>
    </div>
    </Transition>
  </div>
</template>

<style scoped>
.admin-dashboard__hero {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-5);
  margin-bottom: var(--space-6);
  padding: var(--space-6);
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, var(--color-rose-700), var(--color-rose-900));
  color: #fff;
  box-shadow: var(--shadow-lg);
}

.admin-dashboard__hero-glow {
  position: absolute;
  inset: -30% -10% auto auto;
  width: 55%;
  height: 130%;
  background: radial-gradient(ellipse at center, rgba(200, 164, 101, 0.28), transparent 70%);
  filter: blur(6px);
  pointer-events: none;
  /* Drift bem lento (18s) e discreto — presença de "coisa viva", não um
     efeito chamativo que compete com quem está tentando ler os números
     enquanto trabalha. Ver guarda de prefers-reduced-motion no fim do arquivo. */
  animation: hero-glow-drift 18s ease-in-out infinite;
}

@keyframes hero-glow-drift {
  0%, 100% {
    transform: translate(0, 0) scale(1);
    opacity: 0.9;
  }
  50% {
    transform: translate(-4%, 3%) scale(1.08);
    opacity: 1;
  }
}

.admin-dashboard__hero-intro {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

/* Sobrescreve o círculo rosé-sobre-branco de .admin-page-icon (global.css):
   sobre o próprio gradiente rosé do hero ele precisa ser translúcido em vez
   de opaco, senão vira um círculo rosé-claro chapado sem relação com o fundo. */
.admin-dashboard__hero-intro .admin-page-icon {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}

.admin-dashboard__hero-intro h1 {
  color: #fff;
}

.admin-dashboard__hero-intro p {
  color: rgba(255, 255, 255, 0.78);
}

.admin-dashboard__hero-stat {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  text-align: right;
}

.admin-dashboard__hero-stat-label {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.75);
}

.admin-dashboard__hero-stat-value {
  font-family: var(--font-display);
  /* O número mais importante da tela: bem maior que qualquer valor de KPI
     card abaixo (que vai até ~2.6rem no cartão de destaque) — é esse salto
     de escala que sinaliza "olhe aqui primeiro" antes de qualquer outra
     coisa no painel. */
  font-size: clamp(3rem, 12vw, 4.75rem);
  font-weight: 600;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.admin-dashboard__hero-stat-hint {
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.75);
}

@media (max-width: 600px) {
  .admin-dashboard__hero {
    flex-direction: column;
    align-items: flex-start;
  }

  .admin-dashboard__hero-stat {
    align-items: flex-start;
    text-align: left;
  }
}

.admin-dashboard__kpis {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: var(--space-5);
  margin-bottom: var(--space-7);
}

.kpi-card {
  /* container-type habilita cqw abaixo: o tamanho da fonte do valor passa a
     reagir à largura REAL do card (quantas colunas o grid auto-fill decidiu
     encaixar), não à largura da viewport — um clamp em vw não sabia se o
     card tinha 4 ou 7 colunas ao lado, então "R$ 50,00" cabia mas
     "-R$ 50,00" (um caractere a mais) já estourava a borda em telas largas
     com muitas colunas, mesmo a viewport sendo grande. */
  container-type: inline-size;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-5) var(--space-6) var(--space-6);
  transition: transform var(--duration-base) var(--ease-premium), box-shadow var(--duration-base) var(--ease-premium), border-color var(--duration-base) var(--ease-premium);
}

.kpi-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-md);
  border-color: var(--color-rose-300);
}

a.kpi-card {
  color: inherit;
}

.kpi-card--link:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-md);
  border-color: var(--color-rose-500);
}

.kpi-card--accent {
  background: linear-gradient(135deg, var(--color-rose-700), var(--color-rose-900));
  border-color: transparent;
  color: #fff;
}

.kpi-card--accent .kpi-card__label,
.kpi-card--accent .kpi-card__hint {
  color: rgba(255, 255, 255, 0.75);
}

.kpi-card--negative .kpi-card__value {
  color: var(--color-danger);
}

.kpi-card--gold {
  border-color: color-mix(in srgb, var(--color-gold-500) 45%, var(--color-border));
}

.kpi-card--gold:hover {
  border-color: var(--color-gold-500);
}

.kpi-card__icon--gold {
  background: var(--color-gold-100);
  color: var(--color-gold-700);
}

.kpi-card--gold .kpi-card__value {
  color: var(--color-gold-700);
}

/* Aviso de estoque baixo mais presente que só a borda vermelha de antes: um
   fundo levemente tingido (não chapado — continua um cartão de trabalho, não
   um alerta modal) mais o ponto pulsante (ver .kpi-card__alert-dot) juntos
   fazem esse cartão se destacar na leitura rápida da grade, proporcional à
   urgência real de "itens abaixo do mínimo". */
.kpi-card--warning {
  border-color: var(--color-danger);
  background: linear-gradient(160deg, var(--color-surface), color-mix(in srgb, var(--color-danger) 7%, var(--color-surface)));
}

.kpi-card__alert-dot {
  position: absolute;
  top: var(--space-4);
  right: var(--space-4);
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-danger);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-danger) 18%, transparent);
  animation: kpi-alert-pulse 2.2s ease-in-out infinite;
}

@keyframes kpi-alert-pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.35);
    opacity: 0.6;
  }
}

.kpi-card--ring {
  flex-direction: row;
  align-items: center;
  gap: var(--space-4);
  /* O anel + rótulo lado a lado precisam de mais largura que um card comum
     pra "Taxa de conclusão" não quebrar palavra no meio (span 2 colunas do
     grid) — em telas muito estreitas o grid já virou 1 coluna e span:2 não
     faz diferença nenhuma (não existe uma 2ª coluna pra ocupar). */
  grid-column: span 2;
}

.kpi-card--ring__text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.kpi-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  margin-bottom: 6px;
  background: var(--color-rose-100);
  color: var(--color-rose-700);
}

.kpi-card__icon--on-accent {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.kpi-card__icon--warning {
  background: #fce4de;
  color: var(--color-danger);
}

.kpi-card__label {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-ink-soft);
}

.kpi-card__value {
  font-family: var(--font-display);
  /* cqw = 1% da largura do próprio .kpi-card (container-type acima) — troquei
     de vw pra isso porque um clamp baseado na largura da VIEWPORT não sabe
     quantas colunas o grid auto-fill decidiu encaixar lado a lado; o mesmo
     valor de vw resultava num tamanho grande demais sempre que a tela tinha
     colunas suficientes pra apertar o card, estourando a borda com valores
     de 4+ dígitos como "-R$ 50,00".
     Reduzido em relação à versão anterior (14cqw/2.5rem máx.) de propósito:
     agora que "hoje" ganhou destaque próprio no hero, os cards comuns podem
     ceder espaço de escala pros cartões --accent/--gold abaixo, criando uma
     segunda camada de hierarquia dentro da própria grade. */
  font-size: clamp(1.3rem, 11cqw, 2.05rem);
  font-weight: 600;
  color: var(--color-rose-900);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.kpi-card--accent .kpi-card__value,
.kpi-card--gold .kpi-card__value {
  /* Os dois "segundos números mais importantes" da tela (receita do mês e
     ticket médio) — maiores que os cards comuns, mas claramente menores que
     o número do hero, mantendo os três níveis de leitura distintos. */
  font-size: clamp(1.6rem, 15cqw, 2.6rem);
}

.kpi-card--accent .kpi-card__value {
  color: #fff;
}

.kpi-card__hint {
  font-size: 0.78rem;
  color: var(--color-ink-muted);
}

.admin-dashboard__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--space-5);
}

@media (min-width: 1100px) {
  .admin-dashboard__grid {
    grid-template-columns: repeat(3, 1fr);
  }

  .admin-card--chart {
    grid-column: span 2;
  }
}

.admin-card {
  position: relative;
  overflow: hidden;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-5);
  transition: transform var(--duration-base) var(--ease-premium), box-shadow var(--duration-base) var(--ease-premium), border-color var(--duration-base) var(--ease-premium);
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
  transform: translateY(-3px);
  box-shadow: var(--shadow-md);
  border-color: var(--color-rose-300);
}

.admin-card:hover::before {
  opacity: 1;
}

/* Cartões de análise/ferramenta (gráfico de agendamentos, status do mês,
   inspecionar um dia): fita superior sempre visível (não só no :hover) e um
   fundo com gradiente bem sutil pra se diferenciar dos cartões de listagem
   de apoio abaixo — o objetivo é que o olho pouse nestes primeiro. */
.admin-card--feature {
  padding-block: var(--space-6);
  background: linear-gradient(180deg, var(--color-surface), color-mix(in srgb, var(--color-rose-100) 32%, var(--color-surface)));
}

.admin-card--feature::before {
  opacity: 1;
}

.admin-card--feature h2 {
  font-size: 1.15rem;
}

/* Cartões de listagem de apoio (receita x gastos, categorias, estoque,
   próximos, top serviços): mais enxutos — menos padding, título menor — pra
   não competir em peso visual com os --feature acima. */
.admin-card--list {
  padding: var(--space-4) var(--space-5);
}

.admin-card--list h2 {
  font-size: 0.95rem;
}

.admin-card h2 {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1.05rem;
  margin-bottom: var(--space-4);
}

.admin-card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.admin-card__head h2 {
  margin-bottom: 0;
}

.chart-range {
  display: flex;
  gap: 2px;
  background: var(--color-surface-muted);
  border-radius: var(--radius-pill);
  padding: 3px;
  margin-bottom: var(--space-4);
}

.chart-range__btn {
  background: none;
  border: none;
  padding: 5px 11px;
  border-radius: var(--radius-pill);
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-ink-muted);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard);
}

.chart-range__btn:hover {
  color: var(--color-rose-700);
}

.chart-range__btn--active {
  background: linear-gradient(135deg, var(--color-rose-700), var(--color-rose-900));
  color: #fff;
}

.admin-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--color-rose-100);
  color: var(--color-rose-700);
}

.admin-dashboard__empty-hint {
  color: var(--color-ink-soft);
  font-size: 0.9rem;
}

/* Estado vazio "com desenho" pros cartões de listagem sem dado — troca uma
   única linha de texto apagado por um ícone centralizado + texto, do jeito
   que os componentes LoadingState/EmptyState compartilhados já fazem em
   outras telas (aqui em miniatura, dentro do próprio cartão, porque não faz
   sentido puxar o componente cheio — que ocupa a tela toda — pra um bloco
   pequeno dentro de um card). */
.admin-card__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding-block: var(--space-5);
  text-align: center;
  color: var(--color-ink-soft);
  font-size: 0.88rem;
}

.admin-card__empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--color-surface-muted);
  color: var(--color-ink-soft);
}

.admin-card__empty-icon--success {
  background: color-mix(in srgb, var(--color-success) 14%, transparent);
  color: var(--color-success);
}

/* Empilhado (anel em cima, lista embaixo) em vez de lado a lado: um anel
   grande o bastante pra ler bem (ver pedido de aumentar os KPIs) ao lado de
   rótulos como "Não compareceu" simplesmente não cabia na largura de um card
   do grid sem cortar texto (overflow:hidden do .admin-card) ou quebrar
   palavra no meio — de pé, a lista usa a largura INTEIRA do card (2 colunas)
   em vez de dividir espaço com o anel. */
.status-donut {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
}

.status-list {
  /* Coluna única, não grade 2x2: o card "Status" é 1 de 3 colunas dentro do
     .container de 1120px do site (~340px de largura real) — dividir isso ao
     meio pra caber 2 status lado a lado deixava cada rótulo mais apertado
     ainda do que a versão anterior (lado a lado com o anel) que eu tinha
     acabado de corrigir. Em coluna única, cada rótulo usa a largura CHEIA do
     card e cabe numa linha só. */
  width: 100%;
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.status-list__row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.status-list__dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-list__label {
  /* min-width:0 é o que falta pra um item flex:1 aceitar encolher/quebrar
     linha abaixo da largura natural do próprio texto — sem isso, "Não
     compareceu" simplesmente ultrapassava a borda do card (cortado pelo
     overflow:hidden do .admin-card) em vez de quebrar linha, toda vez que o
     anel do donut (aumentado a pedido) deixava menos espaço sobrando pra
     lista ao lado dele. */
  flex: 1;
  min-width: 0;
  font-size: 1rem;
  color: var(--color-ink);
}

.status-list__count {
  flex-shrink: 0;
  font-family: var(--font-display);
  font-size: 1.3rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--color-ink);
}

.low-stock-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.low-stock-list__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  font-size: 0.9rem;
}

.low-stock-list__qty {
  color: var(--color-danger);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.kpi-trend {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: fit-content;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 9px;
  border-radius: var(--radius-pill);
}

.kpi-trend--good {
  background: rgba(79, 122, 92, 0.12);
  color: var(--color-success);
}

.kpi-trend--bad {
  background: rgba(164, 69, 63, 0.12);
  color: var(--color-danger);
}

.kpi-trend--on-accent {
  background: rgba(255, 255, 255, 0.22);
  color: #fff;
}

.upcoming-list,
.top-services-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.upcoming-list__row {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--color-border);
}

.upcoming-list__row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.upcoming-list__when {
  flex-shrink: 0;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-rose-700);
  min-width: 82px;
}

.upcoming-list__info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.upcoming-list__name {
  font-weight: 700;
  color: var(--color-ink);
  font-size: 0.9rem;
}

.upcoming-list__service {
  font-size: 0.8rem;
  color: var(--color-ink-muted);
}

.top-services-list__row {
  display: grid;
  grid-template-columns: 20px 1fr auto;
  align-items: center;
  gap: var(--space-3);
}

.top-services-list__rank {
  font-family: var(--font-display);
  font-weight: 700;
  color: var(--color-rose-300);
  font-size: 1.1rem;
}

.top-services-list__name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-ink);
  grid-column: 2;
  grid-row: 1;
}

.top-services-list__track {
  grid-column: 2;
  grid-row: 2;
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-muted);
  overflow: hidden;
}

.top-services-list__fill {
  height: 100%;
  border-radius: var(--radius-pill);
  background: linear-gradient(90deg, var(--color-rose-500), var(--color-rose-700));
  min-width: 6px;
  transition: width 0.6s var(--ease-premium);
}

.top-services-list__count {
  grid-column: 3;
  grid-row: 1 / span 2;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--color-ink);
  font-size: 0.85rem;
}

.top-services-list__row {
  row-gap: 4px;
}

.admin-card--inspector {
  display: flex;
  flex-direction: column;
}

.day-inspector__form {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}


.admin-error {
  color: var(--color-danger);
  font-size: 0.85rem;
  margin-bottom: var(--space-3);
}

.day-inspector__summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  padding-bottom: var(--space-4);
  margin-bottom: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.day-inspector__title {
  font-weight: 700;
  color: var(--color-ink);
  /* Sem text-transform:capitalize: dayLabel() (calendar.ts) já devolve a
     string corretamente capitalizada em português — um capitalize aqui
     forçaria também o "de" a maiúscula ("01 De Setembro De 2026", errado). */
}

.day-inspector__total {
  font-size: 0.85rem;
  color: var(--color-ink-muted);
}

.day-inspector__badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-left: auto;
}

.admin-badge {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-muted);
  color: var(--color-ink-muted);
}

.admin-badge--confirmed {
  background: var(--color-rose-100);
  color: var(--color-rose-700);
}

.admin-badge--completed {
  background: #e4ede6;
  color: var(--color-success);
}

.admin-badge--cancelled {
  background: var(--color-surface-muted);
  color: var(--color-ink-soft);
}

.admin-badge--no_show {
  background: #f3e2df;
  color: var(--color-danger);
}

.rev-exp {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding-block: var(--space-2);
}

.rev-exp__row {
  display: grid;
  grid-template-columns: 56px 1fr auto;
  align-items: center;
  gap: var(--space-3);
}

.rev-exp__label {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-ink-muted);
}

.rev-exp__track {
  height: 14px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-muted);
  overflow: hidden;
}

.rev-exp__fill {
  height: 100%;
  border-radius: var(--radius-pill);
  min-width: 14px;
  transition: width 0.7s var(--ease-premium);
}

.rev-exp__fill--revenue {
  background: linear-gradient(90deg, var(--color-success), #6fa87d);
}

.rev-exp__fill--expenses {
  background: linear-gradient(90deg, var(--color-danger), #c2726c);
}

.rev-exp__value {
  font-size: 0.85rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--color-ink);
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .admin-dashboard__hero-glow {
    animation: none;
  }

  .kpi-card__alert-dot {
    animation: none;
  }
}
</style>
