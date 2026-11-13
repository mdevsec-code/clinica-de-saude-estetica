<script setup lang="ts">
import { computed } from 'vue';
import type { AdminAppointment, AdminBlockedTime } from '@/types';
import { WEEKDAY_LABELS, type CalendarDay } from '@/utils/calendar';

const props = defineProps<{
  days: CalendarDay[];
  appointmentsByDate: Record<string, AdminAppointment[]>;
  blocksByDate?: Record<string, AdminBlockedTime[]>;
  maxVisible?: number;
}>();

const emit = defineEmits<{
  'select-day': [dateKey: string];
  'select-appointment': [appointment: AdminAppointment];
}>();

const visibleCount = computed(() => props.maxVisible ?? 3);

function appointmentsFor(dateKey: string): AdminAppointment[] {
  return props.appointmentsByDate[dateKey] ?? [];
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bahia' });
}

// Um chip só por dia, resumido: o detalhe (horário e título de cada
// compromisso) fica no modal do dia — aqui a ideia é só sinalizar que a
// Noely tem algo marcado no Google naquele dia.
function blocksLabel(dateKey: string): string | null {
  const blocks = props.blocksByDate?.[dateKey] ?? [];
  if (!blocks.length) return null;
  return blocks.length === 1 ? (blocks[0].reason || 'Bloqueado') : `${blocks.length} bloqueios`;
}
</script>

<template>
  <div class="calendar-grid">
    <div class="calendar-grid__weekdays">
      <span v-for="label in WEEKDAY_LABELS" :key="label">{{ label }}</span>
    </div>
    <div class="calendar-grid__days" :class="{ 'calendar-grid__days--week': days.length === 7 }">
      <button
        v-for="day in days"
        :key="day.dateKey"
        type="button"
        class="calendar-day"
        :class="{ 'calendar-day--muted': !day.isCurrentMonth, 'calendar-day--today': day.isToday }"
        @click="emit('select-day', day.dateKey)"
      >
        <span class="calendar-day__number">{{ day.date.getDate() }}</span>
        <!-- Celular: no lugar dos nomes (cortados em 3 letras por linha), só
             quantos atendimentos o dia tem; tocar no dia abre a lista. -->
        <span class="calendar-day__compact" aria-hidden="true">
          <span v-if="appointmentsFor(day.dateKey).length" class="calendar-day__count">{{ appointmentsFor(day.dateKey).length }}</span>
          <span v-if="blocksLabel(day.dateKey)" class="calendar-day__blocked-dot" />
        </span>

        <span class="calendar-day__items">
          <span v-if="blocksLabel(day.dateKey)" class="calendar-chip calendar-chip--blocked">
            <span class="calendar-chip__name">{{ blocksLabel(day.dateKey) }}</span>
          </span>
          <span
            v-for="appt in appointmentsFor(day.dateKey).slice(0, visibleCount)"
            :key="appt.id"
            class="calendar-chip"
            :class="`calendar-chip--${appt.status.toLowerCase()}`"
            @click.stop="emit('select-appointment', appt)"
          >
            <span class="calendar-chip__time">{{ formatTime(appt.startAt) }}</span>
            <span class="calendar-chip__name">{{ appt.customer.name }}</span>
          </span>

          <span v-if="appointmentsFor(day.dateKey).length > visibleCount" class="calendar-day__more">
            +{{ appointmentsFor(day.dateKey).length - visibleCount }} mais
          </span>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.calendar-grid {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-surface);
}

.calendar-grid__weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  background: var(--color-surface-muted);
  border-bottom: 1px solid var(--color-border);
}

.calendar-grid__weekdays span {
  padding: var(--space-2) var(--space-1);
  text-align: center;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--color-ink-soft);
}

.calendar-grid__days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}

.calendar-day {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-height: 96px;
  padding: 6px;
  border: none;
  border-right: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background var(--duration-fast) var(--ease-standard);
}

.calendar-grid__days--week .calendar-day {
  min-height: 220px;
}

.calendar-day:hover {
  background: var(--color-rose-100);
}

.calendar-day:nth-child(7n) {
  border-right: none;
}

.calendar-day--muted {
  background: var(--color-bg);
  color: var(--color-ink-soft);
}

.calendar-day--muted:hover {
  background: var(--color-surface-muted);
}

.calendar-day--muted .calendar-day__number {
  opacity: 0.5;
}

.calendar-day--today {
  background: var(--color-rose-100);
  box-shadow: inset 0 0 0 1.5px var(--color-rose-500);
  z-index: 1;
}

.calendar-day__number {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-ink);
}

.calendar-day--today .calendar-day__number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--color-fill-700);
  color: #fff;
}

.calendar-day__items {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
}

.calendar-chip {
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 5px;
  background: var(--color-surface);
  border: 1px solid var(--color-rose-300);
  color: var(--color-rose-900);
  font-size: 0.7rem;
  font-weight: 600;
  /* Nome inteiro, em quantas linhas precisar — reticências escondiam quem era a paciente. */
  flex-wrap: wrap;
  overflow-wrap: anywhere;
  transition: transform var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard);
}

.calendar-chip:hover {
  transform: translateY(-1px) scale(1.02);
  box-shadow: var(--shadow-sm);
}

.calendar-chip__time {
  flex-shrink: 0;
  opacity: 0.75;
  font-weight: 700;
}

.calendar-chip__name {
  min-width: 0;
}

.calendar-chip--cancelled {
  background: var(--color-surface-muted);
  color: var(--color-ink-soft);
}

.calendar-chip--cancelled .calendar-chip__name {
  text-decoration: line-through;
}

.calendar-chip--completed {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.calendar-chip--no_show {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}

.calendar-chip--blocked {
  background: var(--color-surface-muted);
  border-style: dashed;
  border-color: var(--color-border);
  color: var(--color-ink-soft);
}

.calendar-chip--blocked:hover {
  transform: none;
  box-shadow: none;
}

.calendar-day__more {
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--color-rose-700);
  padding-left: 6px;
}

@media (max-width: 780px) {
  .calendar-grid__weekdays span {
    font-size: 0.6rem;
  }
  .calendar-day {
    min-height: 64px;
  }
  .calendar-chip {
    font-size: 0.62rem;
  }
}

.calendar-day__compact {
  display: none;
}

@media (max-width: 640px) {
  .calendar-day {
    min-height: 58px;
    align-items: center;
    padding: 6px 2px;
  }

  .calendar-day__items {
    display: none;
  }

  .calendar-day__compact {
    display: flex;
    align-items: center;
    gap: 3px;
    min-height: 20px;
  }

  .calendar-day__count {
    min-width: 22px;
    padding: 2px 6px;
    border-radius: var(--radius-pill);
    background: var(--color-fill-700);
    color: #fff;
    font-size: 0.72rem;
    font-weight: 700;
    text-align: center;
  }

  .calendar-day__blocked-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--color-ink-soft);
  }
}
</style>
