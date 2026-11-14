<script setup lang="ts">
import { computed } from 'vue';
import { buildMonthGrid } from '@/utils/calendar';
import type { AdminAppointment } from '@/types';

// Visão do ano: 12 meses pequenos, cada dia com a quantidade de atendimentos
// (cor mais forte = dia mais cheio). Tocar num dia abre esse dia na agenda.
const props = defineProps<{ year: number; appointmentsByDate: Record<string, AdminAppointment[]> }>();
const emit = defineEmits<{ selectDay: [dateKey: string] }>();

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const months = computed(() =>
  Array.from({ length: 12 }, (_, m) => ({
    label: new Date(props.year, m, 1).toLocaleDateString('pt-BR', { month: 'long' }),
    days: buildMonthGrid(props.year, m),
  })),
);
const countOf = (key: string) => props.appointmentsByDate[key]?.filter((a) => a.status !== 'CANCELLED').length ?? 0;
const monthTotal = (days: { dateKey: string; isCurrentMonth: boolean }[]) =>
  days.reduce((n, d) => n + (d.isCurrentMonth ? countOf(d.dateKey) : 0), 0);
// 4 tons: 1–2, 3–5, 6–9, 10+ atendimentos no dia.
const level = (n: number) => (n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : n <= 9 ? 3 : 4);
</script>

<template>
  <div class="year">
    <section v-for="m in months" :key="m.label" class="year__month">
      <h3 class="year__title">
        {{ m.label }} <span>{{ monthTotal(m.days) }}</span>
      </h3>
      <div class="year__grid">
        <span v-for="(w, i) in WEEKDAYS" :key="`w${i}`" class="year__weekday">{{ w }}</span>
        <button
          v-for="d in m.days"
          :key="d.dateKey"
          type="button"
          class="year__day"
          :class="[`year__day--l${level(countOf(d.dateKey))}`, { 'is-out': !d.isCurrentMonth, 'is-today': d.isToday }]"
          :disabled="!d.isCurrentMonth"
          :aria-label="`${d.dateKey}: ${countOf(d.dateKey)} atendimento(s)`"
          :title="countOf(d.dateKey) ? `${countOf(d.dateKey)} atendimento(s)` : undefined"
          @click="emit('selectDay', d.dateKey)"
        >
          {{ d.date.getDate() }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.year {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
  gap: var(--space-4);
}

.year__month {
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.year__title {
  display: flex;
  justify-content: space-between;
  margin: 0 0 var(--space-3);
  font-size: 0.95rem;
  text-transform: capitalize;
}

.year__title span {
  font-size: 0.8rem;
  color: var(--color-ink-muted);
}

.year__grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 3px;
}

.year__weekday {
  font-size: 0.68rem;
  font-weight: 700;
  text-align: center;
  color: var(--color-ink-soft);
}

.year__day {
  aspect-ratio: 1;
  border: 0;
  border-radius: 6px;
  background: var(--color-surface-muted);
  color: var(--color-ink);
  font: inherit;
  font-size: 0.72rem;
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-standard);
}

.year__day:hover:not(:disabled) {
  transform: scale(1.12);
}

.year__day.is-out {
  visibility: hidden;
}

.year__day.is-today {
  outline: 2px solid var(--color-fill-700);
  outline-offset: 1px;
}

.year__day--l1 { background: color-mix(in srgb, var(--color-fill-700) 25%, var(--color-surface)); }
.year__day--l2 { background: color-mix(in srgb, var(--color-fill-700) 50%, var(--color-surface)); }
.year__day--l3 { background: color-mix(in srgb, var(--color-fill-700) 75%, var(--color-surface)); color: #fff; }
.year__day--l4 { background: var(--color-fill-900); color: #fff; }
</style>
