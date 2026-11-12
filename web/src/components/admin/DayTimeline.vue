<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { gsap, prefersReducedMotion } from '@/lib/motion';
import type { AdminAppointment, AdminBlockedTime } from '@/types';
import type { Schedule } from '@/services/admin-schedule.service';
import DayAppointmentList from './DayAppointmentList.vue';
import ComandaModal from './ComandaModal.vue';

// Linha do tempo do dia: todos os horários, de 30 em 30 minutos, do início
// ao fim do expediente — os vazios inclusive. Tocar num vazio abre o atalho
// para marcar uma paciente ou bloquear aquele horário; tocar num atendimento
// abre as ações dele (comanda, concluir, cancelar) logo abaixo.
const props = defineProps<{
  dateKey: string; // YYYY-MM-DD (horário da Bahia)
  appointments: AdminAppointment[];
  blocks: AdminBlockedTime[];
  schedule: Schedule | null;
}>();
const emit = defineEmits<{
  book: [time: string];
  block: [start: string, end: string];
  changed: [];
  unblocked: [];
}>();

const TZ_OFFSET = '-03:00'; // America/Bahia, sem horário de verão.
const STEP = 30; // minutos por linha
const ROW = 52; // px por linha
const PX = ROW / STEP;

const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const toHM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const dayStart = computed(() => new Date(`${props.dateKey}T00:00:00${TZ_OFFSET}`).getTime());
// Minutos desde a meia-noite da Bahia, recortado ao próprio dia.
const minOfDay = (iso: string) => Math.max(0, Math.min(24 * 60, Math.round((new Date(iso).getTime() - dayStart.value) / 60000)));
const fmt = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bahia' });

const weekday = computed(() => new Date(`${props.dateKey}T12:00:00Z`).getUTCDay());
const hours = computed(() => props.schedule?.days.find((d) => d.weekday === weekday.value) ?? null);
const isOpen = computed(() => !!hours.value?.open);
const lunch = computed(() => (props.schedule?.lunch.enabled ? { start: toMin(props.schedule.lunch.start), end: toMin(props.schedule.lunch.end) } : null));

// Só sinaliza o almoço quando ele cai dentro do expediente (o sábado, que
// fecha às 12:00, não tem almoço).
const lunchInHours = computed(
  () => !!lunch.value && isOpen.value && lunch.value.start < toMin(hours.value!.closesAt) && lunch.value.end > toMin(hours.value!.opensAt),
);

const active = computed(() => props.appointments.filter((a) => a.status !== 'CANCELLED'));
const cancelled = computed(() => props.appointments.filter((a) => a.status === 'CANCELLED'));

// Janela: o expediente do dia, esticada para caber atendimentos/bloqueios
// fora dele (ex.: paciente que ficou às 08:00 de sábado). Dia fechado sem
// nada marcado mostra 08:00–18:00 só para permitir um encaixe.
// Encaixe fora da agenda oficial: a janela começa 1h antes de abrir e vai
// até 3h depois de fechar (no máximo 22:00) — essas linhas aparecem como
// "Fora do expediente · toque para encaixar".
const range = computed(() => {
  let start = (isOpen.value ? toMin(hours.value!.opensAt) : 8 * 60) - 60;
  let end = Math.min((isOpen.value ? toMin(hours.value!.closesAt) : 18 * 60) + 180, 22 * 60);
  for (const a of active.value) {
    start = Math.min(start, minOfDay(a.startAt));
    end = Math.max(end, minOfDay(a.endAt));
  }
  for (const b of props.blocks) {
    const bs = minOfDay(b.startAt), be = minOfDay(b.endAt);
    if (be - bs < 24 * 60) { start = Math.min(start, bs); end = Math.max(end, be); }
  }
  start = Math.floor(start / STEP) * STEP;
  end = Math.ceil(end / STEP) * STEP;
  return { start, end };
});

const fullDayBlock = computed(() => props.blocks.find((b) => minOfDay(b.endAt) - minOfDay(b.startAt) >= 24 * 60 - 1) ?? null);

interface Event {
  key: string;
  kind: 'appt' | 'block';
  start: number;
  end: number;
  lane: number;
  lanes: number;
  appt?: AdminAppointment;
  block?: AdminBlockedTime;
}

// Atendimentos e bloqueios posicionados no tempo; encaixes sobrepostos
// dividem a largura em colunas.
const events = computed<Event[]>(() => {
  const list: Event[] = [
    ...active.value.map((a) => ({ key: a.id, kind: 'appt' as const, start: minOfDay(a.startAt), end: minOfDay(a.endAt), lane: 0, lanes: 1, appt: a })),
    ...props.blocks
      .filter((b) => b !== fullDayBlock.value)
      .map((b) => ({ key: b.id, kind: 'block' as const, start: Math.max(minOfDay(b.startAt), range.value.start), end: Math.min(minOfDay(b.endAt), range.value.end), lane: 0, lanes: 1, block: b })),
  ].sort((x, y) => x.start - y.start || y.end - x.end);
  let group: Event[] = [];
  let groupEnd = -1;
  const flush = () => { const n = Math.max(...group.map((e) => e.lane)) + 1; group.forEach((e) => (e.lanes = n)); };
  for (const e of list) {
    if (e.start >= groupEnd && group.length) { flush(); group = []; }
    const used = new Set(group.filter((g) => g.end > e.start).map((g) => g.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    e.lane = lane;
    group.push(e);
    groupEnd = Math.max(groupEnd, e.end);
  }
  if (group.length) flush();
  return list;
});

const nowMin = ref(0);
function tickNow() {
  const diff = Math.round((Date.now() - dayStart.value) / 60000);
  nowMin.value = diff;
}
tickNow();
let nowTimer: ReturnType<typeof setInterval> | undefined;
onMounted(() => { nowTimer = setInterval(tickNow, 60_000); });
onUnmounted(() => clearInterval(nowTimer));

interface Row {
  start: number;
  label: string;
  state: 'free' | 'busy' | 'lunch' | 'past' | 'closed';
}

const rows = computed<Row[]>(() => {
  const out: Row[] = [];
  for (let m = range.value.start; m < range.value.end; m += STEP) {
    const end = m + STEP;
    const busy = !!fullDayBlock.value || events.value.some((e) => e.start < end && e.end > m);
    const inLunch = !!lunch.value && lunch.value.start < end && lunch.value.end > m;
    const outside = !isOpen.value || m < toMin(hours.value!.opensAt) || end > toMin(hours.value!.closesAt);
    const state: Row['state'] = busy ? 'busy' : inLunch ? 'lunch' : end <= nowMin.value ? 'past' : outside ? 'closed' : 'free';
    out.push({ start: m, label: toHM(m), state });
  }
  return out;
});

const freeCount = computed(() => rows.value.filter((r) => r.state === 'free').length);
const height = computed(() => ((range.value.end - range.value.start) / STEP) * ROW);
const top = (m: number) => (m - range.value.start) * PX;

// --- Atalho do horário vazio ---
const menuAt = ref<number | null>(null);
function openMenu(row: Row) {
  if (row.state === 'busy' || row.state === 'past') return;
  menuAt.value = menuAt.value === row.start ? null : row.start;
}
function book(row: Row) {
  menuAt.value = null;
  emit('book', row.label);
}
function blockSlot(row: Row) {
  menuAt.value = null;
  emit('block', row.label, toHM(row.start + STEP));
}

// --- Detalhe do atendimento/bloqueio tocado ---
const selectedKey = ref<string | null>(null);
const selected = computed(() => events.value.find((e) => e.key === selectedKey.value) ?? null);
// A visita inteira da paciente naquele dia (vários serviços) vai junto: é o
// que a comanda fecha de uma vez.
const selectedVisit = computed(() => (selected.value?.appt ? active.value.filter((a) => a.customerId === selected.value!.appt!.customerId) : []));
function select(e: Event) {
  selectedKey.value = selectedKey.value === e.key ? null : e.key;
  menuAt.value = null;
}

function apptTone(a: AdminAppointment) {
  if (a.status === 'COMPLETED') return 'done';
  if (a.status === 'NO_SHOW') return 'noshow';
  if (a.rescheduleOfferSentAt && a.rescheduleProposedStartAt && !a.rescheduleAcceptedAt) return 'pending';
  return a.clientConfirmedAt ? 'confirmed' : 'booked';
}

// --- Movimento: linhas entram em onda, eventos "assentam" por cima ---
const root = ref<HTMLElement | null>(null);
async function animateIn() {
  await nextTick();
  if (prefersReducedMotion() || !root.value) return;
  const tl = gsap.timeline({ defaults: { ease: 'premium-out' } });
  // clearProps: transform residual nas linhas criaria um contexto de
  // empilhamento e prenderia o menu do atalho atrás dos atendimentos.
  tl.from(root.value.querySelectorAll('.tl-row'), { opacity: 0, x: -10, duration: 0.45, stagger: 0.018, clearProps: 'transform,opacity' })
    .from(root.value.querySelectorAll('.tl-event'), { opacity: 0, scale: 0.94, y: 8, duration: 0.5, stagger: 0.05, transformOrigin: 'left center', clearProps: 'transform,opacity' }, 0.12)
    .from(root.value.querySelectorAll('.tl-now'), { scaleX: 0, transformOrigin: 'left center', duration: 0.6, clearProps: 'transform' }, 0.3);
}
onMounted(animateIn);
watch(() => props.dateKey, animateIn);

watch(menuAt, async (v) => {
  if (v === null || prefersReducedMotion()) return;
  await nextTick();
  const el = root.value?.querySelector('.tl-menu');
  if (el) gsap.fromTo(el, { opacity: 0, y: -6, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: 'premium-out' });
});
watch(selectedKey, async (v) => {
  if (!v || prefersReducedMotion()) return;
  await nextTick();
  const el = root.value?.querySelector('.tl-detail');
  if (el) gsap.fromTo(el, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.45, ease: 'premium-out' });
});
</script>

<template>
  <div ref="root" class="tl">
    <div class="tl__summary">
      <span class="tl__chip">{{ isOpen ? `${hours!.opensAt} – ${hours!.closesAt}` : 'Fechado neste dia' }}</span>
      <span class="tl__chip tl__chip--rose">{{ active.length }} atendimento{{ active.length === 1 ? '' : 's' }}</span>
      <span class="tl__chip tl__chip--free">{{ freeCount }} horário{{ freeCount === 1 ? '' : 's' }} livre{{ freeCount === 1 ? '' : 's' }}</span>
      <span v-if="lunchInHours" class="tl__chip tl__chip--gold">Almoço {{ schedule!.lunch.start }} – {{ schedule!.lunch.end }}</span>
    </div>

    <div v-if="fullDayBlock" class="tl__fullday">
      <strong>Dia bloqueado</strong> · {{ fullDayBlock.reason || 'Indisponível' }}
      <span>{{ fullDayBlock.source === 'MANUAL' ? 'bloqueado no painel' : 'Google Agenda' }}</span>
    </div>

    <div class="tl__grid" :style="{ height: `${height}px` }">
      <div
        v-for="row in rows"
        :key="row.start"
        class="tl-row"
        :class="[`tl-row--${row.state}`, { 'tl-row--menu': menuAt === row.start }]"
        :style="{ top: `${top(row.start)}px`, height: `${ROW}px` }"
      >
        <span class="tl-row__time">{{ row.label }}</span>
        <button
          v-if="row.state !== 'busy'"
          type="button"
          class="tl-row__slot"
          :disabled="row.state === 'past'"
          :aria-label="`Horário ${row.label} — ${row.state === 'lunch' ? 'almoço' : row.state === 'past' ? 'já passou' : 'livre'}`"
          @click="openMenu(row)"
        >
          <span v-if="row.state === 'lunch'" class="tl-row__tag">Almoço</span>
          <span v-else-if="row.state === 'closed'" class="tl-row__tag">Fora do expediente · toque para encaixar</span>
          <span v-else-if="row.state === 'free'" class="tl-row__plus" aria-hidden="true">+</span>
        </button>

        <div v-if="menuAt === row.start" class="tl-menu" role="menu">
          <span class="tl-menu__title">{{ row.label }}</span>
          <button type="button" class="tl-menu__item tl-menu__item--primary" role="menuitem" @click="book(row)">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6" /></svg>
            Marcar paciente
          </button>
          <button type="button" class="tl-menu__item" role="menuitem" @click="blockSlot(row)">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
            Bloquear {{ row.label }}–{{ toHM(row.start + STEP) }}
          </button>
        </div>
      </div>

      <div
        v-if="nowMin > range.start && nowMin < range.end"
        class="tl-now"
        :style="{ top: `${top(nowMin)}px` }"
        aria-hidden="true"
      />

      <button
        v-for="e in events"
        :key="e.key"
        type="button"
        class="tl-event"
        :class="[
          e.kind === 'block' ? 'tl-event--block' : `tl-event--${apptTone(e.appt!)}`,
          { 'tl-event--selected': selectedKey === e.key, 'tl-event--compact': e.end - e.start <= 40 },
        ]"
        :style="{
          top: `${top(e.start) + 2}px`,
          height: `${Math.max((e.end - e.start) * PX - 4, 26)}px`,
          left: `calc(64px + (100% - 72px) * ${e.lane / e.lanes})`,
          width: `calc((100% - 72px) / ${e.lanes} - 6px)`,
        }"
        @click="select(e)"
      >
        <template v-if="e.appt">
          <span class="tl-event__time">{{ fmt(e.appt.startAt) }}–{{ fmt(e.appt.endAt) }}</span>
          <span class="tl-event__name">{{ e.appt.customer.name }}</span>
          <span class="tl-event__service">{{ e.appt.service.name }}</span>
          <span v-if="apptTone(e.appt) === 'pending'" class="tl-event__flag">Proposta de novo horário enviada</span>
          <span v-else-if="e.appt.clientConfirmedAt && e.appt.status === 'CONFIRMED'" class="tl-event__flag">Confirmou ✓</span>
        </template>
        <template v-else>
          <span class="tl-event__time">{{ fmt(e.block!.startAt) }}–{{ fmt(e.block!.endAt) }}</span>
          <span class="tl-event__name">{{ e.block!.reason || 'Bloqueado' }}</span>
          <span class="tl-event__service">{{ e.block!.source === 'MANUAL' ? 'Bloqueado no painel' : 'Google Agenda' }}</span>
        </template>
      </button>
    </div>

    <!-- Cliente: a comanda abre numa janela própria (antes aparecia um
         cartão lá embaixo da agenda e a comanda só depois). Bloqueio: o
         cartão com "Desbloquear" continua embaixo. -->
    <ComandaModal v-if="selected?.appt && selectedVisit.length" :visit="selectedVisit" @close="selectedKey = null" @changed="emit('changed')" />
    <div v-else-if="selected?.block" class="tl-detail">
      <DayAppointmentList :appointments="[]" :blocks="[selected.block]" hide-empty @unblocked="selectedKey = null; emit('unblocked')" />
    </div>

    <details v-if="cancelled.length" class="tl__cancelled">
      <summary>{{ cancelled.length }} cancelado{{ cancelled.length === 1 ? '' : 's' }} neste dia</summary>
      <DayAppointmentList :appointments="cancelled" @changed="emit('changed')" />
    </details>
  </div>
</template>

<style scoped>
.tl {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.tl__summary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.tl__chip {
  padding: 5px 12px;
  border-radius: var(--radius-pill);
  font-size: 0.78rem;
  font-weight: 700;
  background: var(--color-surface-muted);
  color: var(--color-ink-muted);
}

.tl__chip--rose { background: var(--color-rose-100); color: var(--color-rose-900); }
.tl__chip--free { background: var(--color-success-bg); color: var(--color-success); }
.tl__chip--gold { background: var(--color-gold-100); color: var(--color-gold-700); }

.tl__fullday {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: repeating-linear-gradient(135deg, var(--color-surface-muted) 0 10px, var(--color-surface) 10px 20px);
  border: 1px dashed var(--color-border);
  font-size: 0.9rem;
}

.tl__fullday span {
  color: var(--color-ink-soft);
}

.tl__grid {
  position: relative;
}

.tl-row {
  position: absolute;
  left: 0;
  right: 0;
  display: flex;
  align-items: stretch;
  border-top: 1px solid var(--color-border);
}

/* Linha com o atalho aberto fica acima dos atendimentos (z 3) e da linha
   do "agora" (z 4). */
.tl-row--menu {
  z-index: 8;
}

.tl-row:nth-child(2n) {
  border-top-style: dashed;
}

.tl-row__time {
  width: 64px;
  flex-shrink: 0;
  padding-top: 4px;
  font-size: 0.78rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--color-ink-muted);
}

.tl-row--past .tl-row__time,
.tl-row--closed .tl-row__time {
  color: var(--color-ink-soft);
}

.tl-row__slot {
  flex: 1;
  position: relative;
  margin: 3px 6px 3px 0;
  min-height: 0;
  border: 1px dashed transparent;
  border-radius: 12px;
  background: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-ink-soft);
  transition: background var(--duration-fast) var(--ease-premium), border-color var(--duration-fast) var(--ease-premium), transform var(--duration-fast) var(--ease-premium);
}

.tl-row--free .tl-row__slot:hover,
.tl-row--free .tl-row__slot:focus-visible {
  background: var(--color-rose-100);
  border-color: var(--color-rose-300);
  color: var(--color-rose-700);
}

.tl-row--closed .tl-row__slot {
  background: repeating-linear-gradient(135deg, transparent 0 8px, rgba(166, 146, 141, 0.08) 8px 16px);
}

.tl-row--closed .tl-row__slot:hover {
  border-color: var(--color-border);
}

.tl-row--lunch .tl-row__slot {
  background: repeating-linear-gradient(135deg, var(--color-gold-100) 0 8px, rgba(244, 234, 214, 0.4) 8px 16px);
  border-color: rgba(200, 164, 101, 0.4);
  border-style: solid;
}

.tl-row--past .tl-row__slot {
  cursor: default;
}

.tl-row__plus {
  font-size: 1.2rem;
  font-weight: 700;
  opacity: 0;
  transform: scale(0.6);
  transition: opacity var(--duration-fast) var(--ease-premium), transform var(--duration-base) var(--ease-premium);
}

.tl-row--free .tl-row__slot:hover .tl-row__plus,
.tl-row--free .tl-row__slot:focus-visible .tl-row__plus {
  opacity: 1;
  transform: scale(1);
}

.tl-row__tag {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.tl-row--lunch .tl-row__tag {
  color: var(--color-gold-700);
}

.tl-menu {
  position: absolute;
  z-index: 6;
  top: calc(100% - 6px);
  left: 72px;
  min-width: 240px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--space-2);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-float);
}

.tl-menu__title {
  padding: 4px 8px;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-ink-soft);
}

.tl-menu__item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 10px 12px;
  min-height: 0;
  border: none;
  border-radius: 10px;
  background: none;
  font: inherit;
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--color-ink);
  text-align: left;
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-premium);
}

.tl-menu__item:hover {
  background: var(--color-surface-muted);
}

.tl-menu__item--primary {
  background: linear-gradient(135deg, var(--color-fill-700), var(--color-fill-900));
  color: #fff;
}

.tl-menu__item--primary:hover {
  background: linear-gradient(135deg, var(--color-rose-900), var(--color-dusk-700));
}

.tl-now {
  position: absolute;
  left: 58px;
  right: 0;
  z-index: 4;
  height: 2px;
  background: var(--color-danger);
  pointer-events: none;
}

.tl-now::before {
  content: '';
  position: absolute;
  left: -5px;
  top: -4px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-danger);
}

.tl-event {
  position: absolute;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  overflow: hidden;
  padding: 6px 10px 6px 14px;
  min-height: 0;
  border: none;
  border-radius: 12px;
  text-align: left;
  font: inherit;
  cursor: pointer;
  background: var(--color-rose-100);
  color: var(--color-rose-900);
  transition: transform var(--duration-base) var(--ease-premium), box-shadow var(--duration-base) var(--ease-premium);
}

.tl-event::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--color-rose-700);
}

.tl-event:hover,
.tl-event--selected {
  transform: translateY(-1px);
  box-shadow: var(--shadow-glow);
}

.tl-event--confirmed { background: linear-gradient(135deg, var(--color-rose-100), var(--color-surface-muted)); }
.tl-event--done { background: var(--color-success-bg); color: var(--color-success-ink); }
.tl-event--done::before { background: var(--color-success); }
.tl-event--noshow { background: var(--color-danger-bg); color: var(--color-danger-ink); }
.tl-event--noshow::before { background: var(--color-danger); }
.tl-event--pending { background: var(--color-gold-100); color: var(--color-warn-ink); }
.tl-event--pending::before { background: var(--color-gold-500); }
.tl-event--block {
  background: repeating-linear-gradient(135deg, var(--color-surface-muted) 0 10px, var(--color-surface) 10px 20px);
  color: var(--color-ink-muted);
  border: 1px dashed var(--color-border);
}
.tl-event--block::before { background: var(--color-ink-soft); }

/* Atendimento curto (até 40 min): tudo numa linha só — horário, nome,
   serviço e o aviso —, senão o nome da paciente ficava cortado. */
.tl-event--compact {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  align-content: center;
  column-gap: 10px;
  row-gap: 0;
}

.tl-event--compact .tl-event__service {
  max-width: none;
  flex: 0 1 auto;
}

.tl-event--compact .tl-event__flag {
  margin-top: 0;
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.6);
}

.tl-event__time {
  font-size: 0.72rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}

.tl-event__name {
  max-width: 100%;
  font-weight: 800;
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tl-event__service {
  max-width: 100%;
  font-size: 0.78rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.85;
}

.tl-event__flag {
  margin-top: 2px;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.tl-detail {
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
}

.tl__cancelled summary {
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-ink-muted);
  margin-bottom: var(--space-3);
}
</style>
