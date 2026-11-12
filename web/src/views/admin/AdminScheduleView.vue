<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { gsap, prefersReducedMotion } from '@/lib/motion';
import { fetchSchedule, saveSchedule, type Schedule } from '@/services/admin-schedule.service';
import { ApiError } from '@/services/api';
import LoadingState from '@/components/LoadingState.vue';
import EmptyState from '@/components/EmptyState.vue';

// Horário de funcionamento de cada dia e o almoço — de onde saem os horários
// livres do site e a linha do tempo da agenda.
const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
// Começa na segunda: é como a semana da clínica é lida.
const ORDER = [1, 2, 3, 4, 5, 6, 0];

const schedule = ref<Schedule | null>(null);
const original = ref('');
const loading = ref(true);
const loadError = ref<string | null>(null);
const saving = ref(false);
const saveError = ref<string | null>(null);
const savedAt = ref<number | null>(null);

onMounted(async () => {
  try {
    schedule.value = await fetchSchedule();
    original.value = JSON.stringify(schedule.value);
  } catch {
    loadError.value = 'Não foi possível carregar o horário de atendimento.';
  } finally {
    loading.value = false;
  }
  await nextTick();
  if (!prefersReducedMotion()) {
    gsap.from('.schedule-day', { y: 18, opacity: 0, duration: 0.6, stagger: 0.05, ease: 'premium-out', clearProps: 'transform,opacity' });
  }
});

const orderedDays = computed(() => (schedule.value ? ORDER.map((w) => schedule.value!.days.find((d) => d.weekday === w)!) : []));
const dirty = computed(() => !!schedule.value && JSON.stringify(schedule.value) !== original.value);

const minutes = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
const invalidDays = computed(() => new Set(orderedDays.value.filter((d) => d.open && d.opensAt >= d.closesAt).map((d) => d.weekday)));
const lunchInvalid = computed(() => !!schedule.value?.lunch.enabled && schedule.value.lunch.start >= schedule.value.lunch.end);
const canSave = computed(() => dirty.value && !invalidDays.value.size && !lunchInvalid.value && !saving.value);

// Horas de atendimento por semana (descontando o almoço onde ele cai dentro
// do expediente) — um resumo rápido para conferir a mudança antes de salvar.
const weeklyHours = computed(() => {
  if (!schedule.value) return 0;
  const { lunch } = schedule.value;
  let total = 0;
  for (const d of schedule.value.days) {
    if (!d.open || d.opensAt >= d.closesAt) continue;
    let m = minutes(d.closesAt) - minutes(d.opensAt);
    if (lunch.enabled) {
      const overlap = Math.min(minutes(d.closesAt), minutes(lunch.end)) - Math.max(minutes(d.opensAt), minutes(lunch.start));
      if (overlap > 0) m -= overlap;
    }
    total += m;
  }
  return Math.round((total / 60) * 10) / 10;
});

function dayBar(d: { opensAt: string; closesAt: string }) {
  // Faixa visual do dia numa régua de 06:00 a 22:00.
  const start = 6 * 60, span = 16 * 60;
  const left = Math.max(0, ((minutes(d.opensAt) - start) / span) * 100);
  const right = Math.min(100, ((minutes(d.closesAt) - start) / span) * 100);
  return { left: `${left}%`, width: `${Math.max(0, right - left)}%` };
}

// Almoço recortado ao expediente de cada dia (no sábado, que fecha às 12:00,
// não aparece).
function lunchBar(d: { opensAt: string; closesAt: string }) {
  const l = schedule.value?.lunch;
  if (!l?.enabled) return null;
  const start = l.start > d.opensAt ? l.start : d.opensAt;
  const end = l.end < d.closesAt ? l.end : d.closesAt;
  return start < end ? dayBar({ opensAt: start, closesAt: end }) : null;
}

async function onSave() {
  if (!schedule.value || !canSave.value) return;
  saving.value = true;
  saveError.value = null;
  try {
    schedule.value = await saveSchedule(schedule.value);
    original.value = JSON.stringify(schedule.value);
    savedAt.value = Date.now();
  } catch (err) {
    saveError.value = err instanceof ApiError ? err.message : 'Não foi possível salvar.';
  } finally {
    saving.value = false;
  }
}

function discard() {
  schedule.value = JSON.parse(original.value);
}
</script>

<template>
  <div class="schedule">
    <header class="schedule__header">
      <div>
        <h1>Horário de atendimento</h1>
        <p>Os horários livres do site e a agenda do dia seguem esta configuração.</p>
      </div>
      <div v-if="schedule" class="schedule__summary">
        <span class="schedule__summary-value">{{ weeklyHours.toLocaleString('pt-BR') }}h</span>
        <span class="schedule__summary-label">de atendimento por semana</span>
      </div>
    </header>

    <LoadingState v-if="loading" label="Carregando horários…" />
    <EmptyState v-else-if="loadError" title="Algo deu errado" :description="loadError" />

    <template v-else-if="schedule">
      <section class="schedule__card">
        <h2>Dias da semana</h2>
        <ul class="schedule__days">
          <li
            v-for="d in orderedDays"
            :key="d.weekday"
            class="schedule-day"
            :class="{ 'schedule-day--closed': !d.open, 'schedule-day--invalid': invalidDays.has(d.weekday) }"
          >
            <label class="schedule-day__toggle">
              <input v-model="d.open" type="checkbox" />
              <span class="schedule-day__switch" aria-hidden="true" />
              <span class="schedule-day__name">{{ WEEKDAYS[d.weekday] }}</span>
            </label>

            <div v-if="d.open" class="schedule-day__times">
              <label class="admin-field schedule-day__field">
                <span class="sr-only">Abre às</span>
                <input v-model="d.opensAt" type="time" step="900" required />
              </label>
              <span class="schedule-day__sep">até</span>
              <label class="admin-field schedule-day__field">
                <span class="sr-only">Fecha às</span>
                <input v-model="d.closesAt" type="time" step="900" required />
              </label>
            </div>
            <span v-else class="schedule-day__closed">Fechado</span>

            <div class="schedule-day__track" aria-hidden="true">
              <span v-if="d.open && !invalidDays.has(d.weekday)" class="schedule-day__bar" :style="dayBar(d)" />
              <span v-if="d.open && lunchBar(d)" class="schedule-day__lunch" :style="lunchBar(d)!" />
            </div>
            <p v-if="invalidDays.has(d.weekday)" class="schedule-day__error">O horário de fechar precisa ser depois do de abrir.</p>
          </li>
        </ul>
        <div class="schedule__ruler" aria-hidden="true">
          <span v-for="h in [6, 9, 12, 15, 18, 21]" :key="h" :style="{ left: `${((h - 6) / 16) * 100}%` }">{{ String(h).padStart(2, '0') }}h</span>
        </div>
      </section>

      <section class="schedule__card">
        <div class="schedule__lunch-head">
          <div>
            <h2>Almoço</h2>
            <p>Fica fechado todos os dias nesse intervalo, sem precisar bloquear à mão.</p>
          </div>
          <label class="schedule-day__toggle">
            <input v-model="schedule.lunch.enabled" type="checkbox" />
            <span class="schedule-day__switch" aria-hidden="true" />
            <span class="schedule-day__name">{{ schedule.lunch.enabled ? 'Ativo' : 'Desligado' }}</span>
          </label>
        </div>
        <div v-if="schedule.lunch.enabled" class="schedule-day__times">
          <label class="admin-field schedule-day__field">
            <span class="sr-only">Início do almoço</span>
            <input v-model="schedule.lunch.start" type="time" step="900" required />
          </label>
          <span class="schedule-day__sep">até</span>
          <label class="admin-field schedule-day__field">
            <span class="sr-only">Fim do almoço</span>
            <input v-model="schedule.lunch.end" type="time" step="900" required />
          </label>
        </div>
        <p v-if="lunchInvalid" class="schedule-day__error">O fim do almoço precisa ser depois do início.</p>
      </section>

      <p class="schedule__note">
        Atendimentos já marcados continuam valendo. Quem ficar marcado antes do novo horário de abertura recebe pelo
        WhatsApp a proposta de passar para o horário de abertura — respondendo SIM, a agenda é remarcada sozinha.
      </p>

      <Transition name="savebar">
        <div v-if="dirty || savedAt" class="schedule__savebar">
          <span v-if="dirty">Alterações não salvas</span>
          <span v-else class="schedule__saved">✓ Horário salvo</span>
          <div v-if="dirty" class="schedule__savebar-actions">
            <button type="button" class="button button--ghost" :disabled="saving" @click="discard">Descartar</button>
            <button type="button" class="button button--primary" :disabled="!canSave" @click="onSave">
              {{ saving ? 'Salvando…' : 'Salvar horário' }}
            </button>
          </div>
        </div>
      </Transition>
      <p v-if="saveError" class="schedule-day__error">{{ saveError }}</p>
    </template>
  </div>
</template>

<style scoped>
.schedule {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding-bottom: var(--space-8);
}

.schedule__header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
}

.schedule__header p,
.schedule__lunch-head p {
  margin: var(--space-1) 0 0;
  color: var(--color-ink-muted);
}

.schedule__summary {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.schedule__summary-value {
  font-family: var(--font-serif);
  font-size: 2.4rem;
  line-height: 1;
  color: var(--color-rose-900);
}

.schedule__summary-label {
  font-size: 0.8rem;
  color: var(--color-ink-muted);
}

.schedule__card {
  position: relative;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
}

.schedule__card h2 {
  margin: 0 0 var(--space-4);
  font-size: 1.15rem;
}

.schedule__days {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.schedule-day {
  display: grid;
  grid-template-columns: 170px 260px 1fr;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--color-border);
}

.schedule-day:last-child {
  border-bottom: none;
}

.schedule-day__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  cursor: pointer;
  user-select: none;
}

.schedule-day__toggle input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.schedule-day__switch {
  position: relative;
  width: 40px;
  height: 24px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  transition: background var(--duration-base) var(--ease-premium), border-color var(--duration-base) var(--ease-premium);
  flex-shrink: 0;
}

.schedule-day__switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(58, 38, 34, 0.25);
  transition: transform var(--duration-base) var(--ease-premium);
}

.schedule-day__toggle input:checked + .schedule-day__switch {
  background: linear-gradient(135deg, var(--color-rose-700), var(--color-rose-900));
  border-color: var(--color-rose-700);
}

.schedule-day__toggle input:checked + .schedule-day__switch::after {
  transform: translateX(16px);
}

.schedule-day__toggle input:focus-visible + .schedule-day__switch {
  outline: 2px solid var(--color-rose-500);
  outline-offset: 2px;
}

.schedule-day__name {
  font-weight: 700;
}

.schedule-day--closed .schedule-day__name {
  color: var(--color-ink-soft);
}

.schedule-day__times {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.schedule-day__field {
  min-width: 0;
  flex: 1;
}

.schedule-day__sep,
.schedule-day__closed {
  font-size: 0.85rem;
  color: var(--color-ink-soft);
}

.schedule-day__track {
  position: relative;
  height: 10px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-muted);
  overflow: hidden;
}

.schedule-day__bar {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: var(--radius-pill);
  background: linear-gradient(90deg, var(--color-rose-500), var(--color-rose-700));
  transition: left var(--duration-slow) var(--ease-premium), width var(--duration-slow) var(--ease-premium);
}

.schedule-day__lunch {
  position: absolute;
  top: 0;
  bottom: 0;
  background: repeating-linear-gradient(135deg, var(--color-gold-500) 0 4px, var(--color-gold-100) 4px 8px);
  opacity: 0.9;
  transition: left var(--duration-slow) var(--ease-premium), width var(--duration-slow) var(--ease-premium);
}

.schedule-day__error {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-danger);
}

.schedule__ruler {
  position: relative;
  height: 18px;
  margin-left: calc(170px + 260px + 2 * var(--space-4));
  margin-top: var(--space-2);
  font-size: 0.72rem;
  color: var(--color-ink-soft);
}

.schedule__ruler span {
  position: absolute;
  transform: translateX(-50%);
}

.schedule__lunch-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.schedule__lunch-head h2 {
  margin: 0;
}

.schedule__lunch-head + .schedule-day__times {
  max-width: 280px;
}

.schedule__note {
  margin: 0;
  font-size: 0.88rem;
  color: var(--color-ink-muted);
  max-width: 72ch;
}

.schedule__savebar {
  position: sticky;
  bottom: var(--space-4);
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--color-dusk-800);
  color: #fff;
  box-shadow: var(--shadow-float);
}

.schedule__savebar-actions {
  display: flex;
  gap: var(--space-2);
}

.schedule__savebar .button--ghost {
  color: #fff;
  border-color: rgba(255, 255, 255, 0.3);
}

.schedule__saved {
  color: #b9e3c6;
  font-weight: 700;
}

.savebar-enter-active,
.savebar-leave-active {
  transition: opacity var(--duration-base) var(--ease-premium), transform var(--duration-base) var(--ease-premium);
}

.savebar-enter-from,
.savebar-leave-to {
  opacity: 0;
  transform: translateY(16px);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

@media (max-width: 860px) {
  .schedule-day {
    grid-template-columns: 1fr;
    gap: var(--space-2);
  }
  .schedule__ruler {
    display: none;
  }
}
</style>
