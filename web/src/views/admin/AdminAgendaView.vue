<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ApiError } from '@/services/api';
import { fetchAppointments } from '@/services/admin-appointments.service';
import { fetchCategories } from '@/services/catalog.service';
import type { AdminAppointment, AppointmentStatus, ServiceCategory } from '@/types';
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
import LoadingState from '@/components/LoadingState.vue';
import EmptyState from '@/components/EmptyState.vue';

const router = useRouter();

type ViewMode = 'month' | 'week' | 'day';
const viewMode = ref<ViewMode>('month');
const referenceDate = ref(new Date());

const appointments = ref<AdminAppointment[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const statusFilter = ref<'ALL' | AppointmentStatus>('ALL');
const serviceFilter = ref<string>('ALL');
const categories = ref<ServiceCategory[]>([]);

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
    const { from, to } = currentRange();
    const { appointments: data } = await fetchAppointments({ from: from.toISOString(), to: to.toISOString() });
    appointments.value = data;
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

function goToday() {
  referenceDate.value = new Date();
}

function goPrev() {
  if (viewMode.value === 'month') referenceDate.value = addMonths(referenceDate.value, -1);
  else if (viewMode.value === 'week') referenceDate.value = addDays(referenceDate.value, -7);
  else referenceDate.value = addDays(referenceDate.value, -1);
}

function goNext() {
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

// --- Modal de dia (aberto a partir de um clique na grade em mês/semana) ---
const dayModalKey = ref<string | null>(null);
const dayModalAppointments = computed(() => (dayModalKey.value ? appointmentsByDate.value[dayModalKey.value] ?? [] : []));
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

function onAppointmentCreated() {
  showNewAppointment.value = false;
  load();
}
</script>

<template>
  <div class="admin-agenda">
    <div class="admin-agenda__header">
      <div class="admin-agenda__title">
        <span class="admin-page-icon">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
        </span>
        <div>
          <h1>Agenda</h1>
          <p>Calendário de atendimentos da clínica.</p>
        </div>
      </div>
      <button type="button" class="button button--primary" @click="showNewAppointment = true">+ Novo agendamento</button>
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
        <select v-model="statusFilter">
          <option value="ALL">Todos</option>
          <option value="CONFIRMED">Confirmado</option>
          <option value="CANCELLED">Cancelado</option>
          <option value="COMPLETED">Concluído</option>
          <option value="NO_SHOW">Não compareceu</option>
        </select>
      </label>
      <label class="admin-field">
        Serviço
        <select v-model="serviceFilter">
          <option value="ALL">Todos</option>
          <optgroup v-for="category in categories" :key="category.id" :label="category.name">
            <option v-for="service in category.services" :key="service.id" :value="service.id">{{ service.name }}</option>
          </optgroup>
        </select>
      </label>
    </div>

    <Transition name="fade-swap" mode="out-in">
      <LoadingState v-if="loading" key="loading" label="Carregando agenda…" />
      <EmptyState v-else-if="error" key="error" title="Algo deu errado" :description="error" action-label="Tentar novamente" @action="load" />
      <div v-else key="content">
        <Transition name="fade-swap" mode="out-in">
          <DayAppointmentList v-if="viewMode === 'day'" key="day" :appointments="dayAppointments" />
          <CalendarGrid
            v-else
            :key="viewMode"
            :days="visibleDays"
            :appointments-by-date="appointmentsByDate"
            @select-day="openDayModal"
            @select-appointment="openDayModalForAppointment"
          />
        </Transition>
      </div>
    </Transition>

    <AdminModal v-if="dayModalKey" :title="dayModalTitle" @close="dayModalKey = null">
      <DayAppointmentList :appointments="dayModalAppointments" />
    </AdminModal>

    <NewAppointmentModal v-if="showNewAppointment" @close="showNewAppointment = false" @created="onAppointmentCreated" />
  </div>
</template>

<style scoped>
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
  font-weight: 700;
  color: var(--color-rose-900);
  text-transform: capitalize;
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

.admin-agenda__view-btn--active {
  background: linear-gradient(135deg, var(--color-rose-700), var(--color-rose-900));
  color: #fff;
  box-shadow: var(--shadow-sm);
}

.admin-agenda__filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  margin-bottom: var(--space-5);
}

.admin-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-ink);
  min-width: 180px;
}

.admin-field select {
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 400;
  padding: 9px 34px 9px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background-color: var(--color-surface);
  /* Só dá pra estilizar o CAMPO em si — a lista de opções aberta é
     renderizada pelo sistema operacional, fora do alcance do CSS em
     praticamente todo navegador. appearance:none troca a setinha nativa (que
     varia de aparência entre navegadores/SO) por uma seta consistente com o
     resto do site. */
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239c5b60' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 16px;
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard);
}

.admin-field select:hover {
  border-color: var(--color-rose-500);
}

.admin-field select:focus-visible {
  border-color: var(--color-rose-700);
  box-shadow: 0 0 0 3px var(--color-rose-100);
  outline: none;
}
</style>
