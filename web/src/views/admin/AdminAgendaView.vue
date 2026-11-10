<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { gsap, prefersReducedMotion } from '@/lib/motion';
import { useRouter } from 'vue-router';
import { ApiError } from '@/services/api';
import {
  fetchAppointments,
  fetchBlockedTimes,
  fetchGoogleCalendarStatus,
  syncGoogleCalendarNow,
} from '@/services/admin-appointments.service';
import { fetchCategories } from '@/services/catalog.service';
import { fetchReminders } from '@/services/admin-reminders.service';
import type {
  AdminAppointment,
  AdminBlockedTime,
  AppointmentStatus,
  GoogleCalendarSyncStatus,
  ServiceCategory,
  UnifiedReminder,
} from '@/types';
import {
  addDays,
  addMonths,
  buildMonthGrid,
  buildWeekGrid,
  dayLabel,
  endOfDay,
  monthLabel,
  startOfDay,
  toLocalDateKey,
  weekRangeLabel,
  type CalendarDay,
} from '@/utils/calendar';
import CalendarGrid from '@/components/admin/CalendarGrid.vue';
import DayAppointmentList from '@/components/admin/DayAppointmentList.vue';
import AdminModal from '@/components/admin/AdminModal.vue';
import NewAppointmentModal from '@/components/admin/NewAppointmentModal.vue';
import BlockTimeModal from '@/components/admin/BlockTimeModal.vue';
import AdminSelect, { type AdminSelectGroup, type AdminSelectOption } from '@/components/admin/AdminSelect.vue';
import LoadingState from '@/components/LoadingState.vue';
import EmptyState from '@/components/EmptyState.vue';

const router = useRouter();

type ViewMode = 'month' | 'week' | 'day';
const viewMode = ref<ViewMode>('month');
const referenceDate = ref(new Date());

const appointments = ref<AdminAppointment[]>([]);
const blockedTimes = ref<AdminBlockedTime[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const statusFilter = ref<'ALL' | AppointmentStatus>('ALL');
const serviceFilter = ref<string>('ALL');
const categories = ref<ServiceCategory[]>([]);

const statusOptions: AdminSelectOption<'ALL' | AppointmentStatus>[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'CONFIRMED', label: 'Confirmado' },
  { value: 'CANCELLED', label: 'Cancelado' },
  { value: 'COMPLETED', label: 'Concluído' },
  { value: 'NO_SHOW', label: 'Não compareceu' },
];

const serviceOptions = computed<(AdminSelectOption | AdminSelectGroup)[]>(() => [
  { value: 'ALL', label: 'Todos' },
  ...categories.value.map((category) => ({
    label: category.name,
    options: category.services.map((service) => ({ value: service.id, label: service.name })),
  })),
]);

onMounted(async () => {
  fetchCategories()
    .then(({ categories: data }) => (categories.value = data))
    .catch(() => {});
});

const monthDays = computed(() => buildMonthGrid(referenceDate.value.getFullYear(), referenceDate.value.getMonth()));
const weekDays = computed(() => buildWeekGrid(referenceDate.value));
const visibleDays = computed<CalendarDay[]>(() => (viewMode.value === 'week' ? weekDays.value : monthDays.value));

const rangeLabel = computed(() => {
  if (viewMode.value === 'month') return monthLabel(referenceDate.value);
  if (viewMode.value === 'week') return weekRangeLabel(weekDays.value);
  return dayLabel(referenceDate.value);
});

function currentRange(): { from: Date; to: Date } {
  if (viewMode.value === 'month') {
    const days = monthDays.value;
    return { from: startOfDay(days[0].date), to: endOfDay(days[days.length - 1].date) };
  }
  if (viewMode.value === 'week') {
    const days = weekDays.value;
    return { from: startOfDay(days[0].date), to: endOfDay(days[6].date) };
  }
  return { from: startOfDay(referenceDate.value), to: endOfDay(referenceDate.value) };
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const range = currentRange();
    const params = { from: range.from.toISOString(), to: range.to.toISOString() };
    // Bloqueios são complementares: se falharem, a agenda de atendimentos
    // continua aparecendo normalmente, só sem os compromissos do Google.
    const [{ appointments: data }, blocks] = await Promise.all([
      fetchAppointments(params),
      fetchBlockedTimes(params).catch(() => ({ blockedTimes: [] as AdminBlockedTime[] })),
    ]);
    appointments.value = data;
    blockedTimes.value = blocks.blockedTimes;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      router.push({ name: 'admin-login' });
      return;
    }
    error.value = 'Não foi possível carregar a agenda. Tente novamente.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch([viewMode, referenceDate], load);

// --- Google Agenda (status da sincronização + "Sincronizar agora") ---
// A faixa só aparece com a integração configurada no servidor — sem ela,
// a agenda fica exatamente como antes.
const googleStatus = ref<GoogleCalendarSyncStatus | null>(null);
const syncingGoogle = ref(false);

onMounted(async () => {
  googleStatus.value = await fetchGoogleCalendarStatus().catch(() => null);
});

async function syncGoogleNow() {
  syncingGoogle.value = true;
  try {
    googleStatus.value = await syncGoogleCalendarNow();
    await load();
  } catch {
    // mantém o status anterior; a faixa já mostra o último erro conhecido
  } finally {
    syncingGoogle.value = false;
  }
}

function formatSyncTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Lembretes de retorno/aniversário (mesmo feed do dashboard, ver
// reminders.service.ts no backend) — janela mais larga aqui (14 dias) que no
// dashboard (7): a agenda é onde a recepção efetivamente organiza a semana,
// faz sentido enxergar um pouco mais à frente.
const reminders = ref<UnifiedReminder[]>([]);
onMounted(async () => {
  try {
    const { reminders: data } = await fetchReminders(14);
    reminders.value = data;
  } catch {
    reminders.value = [];
  }
});

function formatReminderDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

// Direção da última navegação: o rótulo do período ("Novembro de 2026")
// entra pelo lado para onde se andou — avançar traz o próximo mês da
// direita, voltar traz o anterior da esquerda. O calendário em si já
// replica a onda de entrada (v-stagger.grid) a cada recarga de dados.
let navDirection = 0;
watch(rangeLabel, async () => {
  if (prefersReducedMotion()) return;
  await nextTick();
  gsap.fromTo(
    '.admin-agenda__range',
    { x: navDirection * 18, opacity: 0 },
    { x: 0, opacity: 1, duration: 0.5, ease: 'premium-out', clearProps: 'transform,opacity' },
  );
  navDirection = 0;
});

function goToday() {
  navDirection = referenceDate.value > new Date() ? -1 : 1;
  referenceDate.value = new Date();
}

function goPrev() {
  navDirection = -1;
  if (viewMode.value === 'month') referenceDate.value = addMonths(referenceDate.value, -1);
  else if (viewMode.value === 'week') referenceDate.value = addDays(referenceDate.value, -7);
  else referenceDate.value = addDays(referenceDate.value, -1);
}

function goNext() {
  navDirection = 1;
  if (viewMode.value === 'month') referenceDate.value = addMonths(referenceDate.value, 1);
  else if (viewMode.value === 'week') referenceDate.value = addDays(referenceDate.value, 7);
  else referenceDate.value = addDays(referenceDate.value, 1);
}

const filteredAppointments = computed(() =>
  appointments.value.filter(
    (a) =>
      (statusFilter.value === 'ALL' || a.status === statusFilter.value) &&
      (serviceFilter.value === 'ALL' || a.service.id === serviceFilter.value),
  ),
);

const appointmentsByDate = computed(() => {
  const map: Record<string, AdminAppointment[]> = {};
  for (const appt of filteredAppointments.value) {
    const key = toLocalDateKey(new Date(appt.startAt));
    (map[key] ??= []).push(appt);
  }
  for (const list of Object.values(map)) {
    list.sort((a, b) => a.startAt.localeCompare(b.startAt));
  }
  return map;
});

const dayAppointments = computed(() => appointmentsByDate.value[toLocalDateKey(referenceDate.value)] ?? []);

// Um bloqueio aparece em todo dia que ele cobre (férias de uma semana marcam
// os sete dias), não só no dia em que começa.
const blocksByDate = computed(() => {
  const map: Record<string, AdminBlockedTime[]> = {};
  for (const block of blockedTimes.value) {
    const end = new Date(block.endAt);
    for (let day = startOfDay(new Date(block.startAt)); day < end; day = addDays(day, 1)) {
      (map[toLocalDateKey(day)] ??= []).push(block);
    }
  }
  return map;
});

const dayBlocks = computed(() => blocksByDate.value[toLocalDateKey(referenceDate.value)] ?? []);

// --- Modal de dia (aberto a partir de um clique na grade em mês/semana) ---
const dayModalKey = ref<string | null>(null);
const dayModalAppointments = computed(() => (dayModalKey.value ? appointmentsByDate.value[dayModalKey.value] ?? [] : []));
const dayModalBlocks = computed(() => (dayModalKey.value ? blocksByDate.value[dayModalKey.value] ?? [] : []));
const dayModalTitle = computed(() =>
  dayModalKey.value ? dayLabel(new Date(`${dayModalKey.value}T12:00:00`)) : '',
);

function openDayModal(dateKey: string) {
  dayModalKey.value = dateKey;
}

function openDayModalForAppointment(appt: AdminAppointment) {
  dayModalKey.value = toLocalDateKey(new Date(appt.startAt));
}

// --- Novo agendamento ---
const showNewAppointment = ref(false);
const showBlockTime = ref(false);

function onBlockCreated() {
  showBlockTime.value = false;
  load();
}

function onAppointmentCreated() {
  showNewAppointment.value = false;
  load();
}
</script>

<template>
  <div class="admin-agenda">
    <div class="admin-agenda__header">
      <div class="admin-agenda__title">
        <div>
          <h1>Agenda</h1>
          <p>Calendário de atendimentos da clínica.</p>
        </div>
      </div>
      <div class="admin-agenda__actions">
        <button type="button" class="button button--ghost" @click="showBlockTime = true">Bloquear horário</button>
        <button type="button" class="button button--primary" @click="showNewAppointment = true">+ Novo agendamento</button>
      </div>
    </div>

    <div class="admin-agenda__toolbar">
      <div class="admin-agenda__nav">
        <button type="button" class="admin-agenda__nav-btn" @click="goToday">Hoje</button>
        <button type="button" class="admin-agenda__nav-btn admin-agenda__nav-btn--icon" aria-label="Anterior" @click="goPrev">‹</button>
        <button type="button" class="admin-agenda__nav-btn admin-agenda__nav-btn--icon" aria-label="Próximo" @click="goNext">›</button>
        <span class="admin-agenda__range">{{ rangeLabel }}</span>
      </div>

      <div class="admin-agenda__view-toggle">
        <button
          v-for="mode in (['month', 'week', 'day'] as ViewMode[])"
          :key="mode"
          type="button"
          class="admin-agenda__view-btn"
          :class="{ 'admin-agenda__view-btn--active': viewMode === mode }"
          @click="viewMode = mode"
        >
          {{ mode === 'month' ? 'Mês' : mode === 'week' ? 'Semana' : 'Dia' }}
        </button>
      </div>
    </div>

    <div class="admin-agenda__filters">
      <label class="admin-field">
        Status
        <AdminSelect v-model="statusFilter" :options="statusOptions" />
      </label>
      <label class="admin-field">
        Serviço
        <AdminSelect v-model="serviceFilter" :options="serviceOptions" />
      </label>
    </div>

    <div v-if="googleStatus?.configured" class="admin-agenda__google" :class="{ 'admin-agenda__google--error': googleStatus.lastError }">
      <span>
        <strong>Google Agenda:</strong>
        <template v-if="googleStatus.lastError">falha na última sincronização — {{ googleStatus.lastError }}</template>
        <template v-else-if="googleStatus.lastSyncAt">
          sincronizado às {{ formatSyncTime(googleStatus.lastSyncAt) }} · {{ googleStatus.importedBlocks }} compromisso(s) fechando horários no site
        </template>
        <template v-else>aguardando a primeira sincronização</template>
      </span>
      <button type="button" class="admin-agenda__nav-btn" :disabled="syncingGoogle" @click="syncGoogleNow">
        {{ syncingGoogle ? 'Sincronizando…' : 'Sincronizar agora' }}
      </button>
    </div>

    <div v-if="reminders.length" class="admin-agenda__reminders">
      <span class="admin-agenda__reminders-label">Lembretes (14 dias):</span>
      <button
        v-for="reminder in reminders"
        :key="`${reminder.kind}-${reminder.returnReminderId ?? reminder.customerId}`"
        type="button"
        class="admin-agenda__reminder-pill"
        :class="{ 'admin-agenda__reminder-pill--birthday': reminder.kind === 'BIRTHDAY' }"
        @click="router.push({ name: 'admin-patient-detail', params: { id: reminder.customerId } })"
      >
        {{ reminder.kind === 'BIRTHDAY' ? '🎂' : '🔁' }} {{ formatReminderDate(reminder.date) }} · {{ reminder.customerName }}
      </button>
    </div>

    <Transition name="fade-swap">
      <LoadingState v-if="loading" key="loading" label="Carregando agenda…" />
      <EmptyState v-else-if="error" key="error" title="Algo deu errado" :description="error" action-label="Tentar novamente" @action="load" />
      <div v-else key="content" v-stagger.grid="'.calendar-day'">
        <Transition name="fade-swap">
          <DayAppointmentList v-if="viewMode === 'day'" key="day" :appointments="dayAppointments" :blocks="dayBlocks" @unblocked="load" />
          <CalendarGrid
            v-else
            :key="viewMode"
            :days="visibleDays"
            :appointments-by-date="appointmentsByDate"
            :blocks-by-date="blocksByDate"
            @select-day="openDayModal"
            @select-appointment="openDayModalForAppointment"
          />
        </Transition>
      </div>
    </Transition>

    <AdminModal v-if="dayModalKey" :title="dayModalTitle" @close="dayModalKey = null">
      <DayAppointmentList :appointments="dayModalAppointments" :blocks="dayModalBlocks" @unblocked="load" />
    </AdminModal>

    <BlockTimeModal
      v-if="showBlockTime"
      :initial-date="viewMode === 'day' ? toLocalDateKey(referenceDate) : dayModalKey ?? undefined"
      @close="showBlockTime = false"
      @created="onBlockCreated"
    />
    <NewAppointmentModal v-if="showNewAppointment" :initial-date="viewMode === 'day' ? toLocalDateKey(referenceDate) : undefined" @close="showNewAppointment = false" @created="onAppointmentCreated" />
  </div>
</template>

<style scoped>
.admin-agenda__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.admin-agenda__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-5);
}

.admin-agenda__title {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.admin-agenda__header p {
  color: var(--color-ink-muted);
}

.admin-agenda__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.admin-agenda__nav {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.admin-agenda__nav-btn {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 8px 14px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard);
}

.admin-agenda__nav-btn:hover {
  border-color: var(--color-rose-500);
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}

.admin-agenda__nav-btn:active {
  transform: translateY(0) scale(0.96);
}

.fade-swap-enter-active,
.fade-swap-leave-active {
  transition: opacity var(--duration-base) var(--ease-premium);
}

.fade-swap-enter-from,
.fade-swap-leave-to {
  opacity: 0;
}

.admin-agenda__nav-btn--icon {
  padding: 8px 12px;
  font-size: 1.1rem;
  line-height: 1;
}

.admin-agenda__range {
  display: inline-block;
  font-family: var(--font-serif);
  font-size: 1.45rem;
  font-weight: 400;
  letter-spacing: -0.01em;
  color: var(--color-rose-900);
  /* Sem text-transform:capitalize: monthLabel/weekRangeLabel/dayLabel
     (calendar.ts) já devolvem a string corretamente capitalizada em
     português — um capitalize aqui forçaria também o "de" a maiúscula
     ("Setembro De 2026", errado). */
}

.admin-agenda__view-toggle {
  display: flex;
  background: var(--color-surface-muted);
  border-radius: var(--radius-pill);
  padding: 3px;
  gap: 2px;
}

.admin-agenda__view-btn {
  background: none;
  border: none;
  padding: 7px 16px;
  border-radius: var(--radius-pill);
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--color-ink-muted);
  cursor: pointer;
}

.admin-agenda__view-btn {
  transition: color var(--duration-fast) var(--ease-standard);
}

.admin-agenda__google {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  font-size: 0.85rem;
  color: var(--color-ink-muted);
}

.admin-agenda__google--error {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.admin-agenda__google .admin-agenda__nav-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.admin-agenda__reminders {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.admin-agenda__reminders-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-ink-muted);
}

.admin-agenda__reminder-pill {
  background: var(--color-rose-100);
  border: 1px solid var(--color-rose-300);
  color: var(--color-rose-700);
  border-radius: var(--radius-pill);
  padding: 5px 12px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-standard);
}

.admin-agenda__reminder-pill:hover {
  transform: translateY(-1px);
}

.admin-agenda__reminder-pill--birthday {
  background: var(--color-gold-100);
  border-color: var(--color-gold-500);
  color: var(--color-gold-700);
}

.admin-agenda__view-btn--active {
  background: var(--color-rose-900);
  color: #fff;
  box-shadow: var(--shadow-sm);
}

.admin-agenda__filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  margin-bottom: var(--space-5);
}

/* Aparência (tipografia, borda, fundo, foco, setinha do select) é
   compartilhada — ver .admin-field em styles/global.css. Aqui fica só o
   dimensionamento específico deste formulário. */
.admin-field {
  min-width: 180px;
}
</style>
