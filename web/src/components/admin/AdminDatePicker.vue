<script setup lang="ts">
// Substitui <input type="date"> onde o calendário nativo do sistema
// operacional (não estilizável por CSS em praticamente nenhum navegador)
// destoava do resto do site. O CAMPO de um <input type="date"> já podia ser
// customizado; o POPUP do calendário nunca poderia — por isso um componente
// próprio, reaproveitando as mesmas funções puras de grade de calendário já
// usadas na Agenda (buildMonthGrid etc.), em vez de tentar (inutilmente)
// estilizar o nativo.
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { addMonths, buildMonthGrid, monthLabel, toLocalDateKey } from '@/utils/calendar';

const props = defineProps<{ modelValue: string; min?: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const open = ref(false);
const panelPos = ref({ top: 0, left: 0 });

function keyToDate(key: string): Date {
  return new Date(`${key}T12:00:00`);
}

const viewDate = ref(props.modelValue ? keyToDate(props.modelValue) : new Date());

const displayLabel = computed(() => {
  if (!props.modelValue) return 'Selecionar data';
  const d = keyToDate(props.modelValue);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
});

const monthDays = computed(() => buildMonthGrid(viewDate.value.getFullYear(), viewDate.value.getMonth()));

function isDisabled(dateKey: string): boolean {
  return !!props.min && dateKey < props.min;
}

// O painel é teleportado para #overlay-slot (ver comentário mais abaixo, no
// <Teleport>) — sem isso, um <input>/botão dentro de um card com
// overflow:hidden (o brilho de destaque no topo de .admin-card depende
// disso) cortava o calendário pela metade sempre que o card não tinha altura
// sobrando abaixo do campo. Fora da árvore do card, position:fixed calculado
// a partir do retângulo real do botão substitui o antigo position:absolute
// relativo ao próprio card.
function positionPanel() {
  if (!trigger.value) return;
  const rect = trigger.value.getBoundingClientRect();
  const panelWidth = 280;
  // Altura real quando já montado (teleport já commitou no DOM nesse ponto);
  // sem fallback aqui, a 1ª abertura de cada instância mediria 0 e sempre
  // abriria pra baixo, mesmo colada no rodapé da tela.
  const panelHeight = panel.value?.getBoundingClientRect().height || 380;

  let left = rect.left;
  if (left + panelWidth > window.innerWidth - 12) {
    left = Math.max(12, window.innerWidth - panelWidth - 12);
  }

  // Abre pra cima quando não sobra espaço embaixo mas sobra em cima — sem
  // isso o painel ultrapassava o fim da viewport e ficava com a metade de
  // baixo cortada/sobre o rodapé da página.
  const spaceBelow = window.innerHeight - rect.bottom;
  let top = rect.bottom + 8;
  if (spaceBelow < panelHeight + 12 && rect.top > panelHeight + 12) {
    top = rect.top - panelHeight - 8;
  }
  top = Math.max(12, Math.min(top, window.innerHeight - panelHeight - 12));

  panelPos.value = { top, left };
}

async function toggle() {
  if (open.value) {
    open.value = false;
    return;
  }
  viewDate.value = props.modelValue ? keyToDate(props.modelValue) : new Date();
  open.value = true;
  await nextTick();
  positionPanel();
}

function selectDay(dateKey: string) {
  if (isDisabled(dateKey)) return;
  emit('update:modelValue', dateKey);
  open.value = false;
}

function goToday() {
  const key = toLocalDateKey(new Date());
  if (isDisabled(key)) return;
  emit('update:modelValue', key);
  open.value = false;
}

function clearDate() {
  emit('update:modelValue', '');
  open.value = false;
}

function prevMonth() {
  viewDate.value = addMonths(viewDate.value, -1);
}

function nextMonth() {
  viewDate.value = addMonths(viewDate.value, 1);
}

function onDocClick(e: MouseEvent) {
  const target = e.target as Node;
  if (open.value && !root.value?.contains(target) && !panel.value?.contains(target)) {
    open.value = false;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false;
}

// Fecha em vez de tentar "seguir" o gatilho durante o scroll — mais simples
// e previsível do que recalcular a posição a cada frame de scroll, e evita o
// popover ficar visualmente "descolado" do botão por um instante.
function onScroll() {
  if (open.value) open.value = false;
}

onMounted(() => {
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('resize', positionPanel);
  window.addEventListener('scroll', onScroll, true);
});
onUnmounted(() => {
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onKeydown);
  window.removeEventListener('resize', positionPanel);
  window.removeEventListener('scroll', onScroll, true);
});

watch(
  () => props.modelValue,
  async (val) => {
    if (val) {
      await nextTick();
      viewDate.value = keyToDate(val);
    }
  },
);
</script>

<template>
  <div ref="root" class="admin-date">
    <button ref="trigger" type="button" class="admin-date__trigger" :class="{ 'admin-date__trigger--open': open }" @click="toggle">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
      <span>{{ displayLabel }}</span>
    </button>

    <Teleport to="#overlay-slot">
      <Transition name="admin-date-pop">
        <div
          v-if="open"
          ref="panel"
          class="admin-date__panel"
          role="dialog"
          aria-label="Selecionar data"
          :style="{ top: `${panelPos.top}px`, left: `${panelPos.left}px` }"
        >
          <div class="admin-date__nav">
            <button type="button" class="admin-date__nav-btn" aria-label="Mês anterior" @click="prevMonth">‹</button>
            <span class="admin-date__month">{{ monthLabel(viewDate) }}</span>
            <button type="button" class="admin-date__nav-btn" aria-label="Próximo mês" @click="nextMonth">›</button>
          </div>

          <div class="admin-date__weekdays">
            <span v-for="(d, i) in ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']" :key="i">{{ d }}</span>
          </div>

          <div class="admin-date__grid">
            <button
              v-for="day in monthDays"
              :key="day.dateKey"
              type="button"
              class="admin-date__day"
              :class="{
                'admin-date__day--muted': !day.isCurrentMonth,
                'admin-date__day--today': day.isToday,
                'admin-date__day--selected': day.dateKey === modelValue,
                'admin-date__day--disabled': isDisabled(day.dateKey),
              }"
              :disabled="isDisabled(day.dateKey)"
              @click="selectDay(day.dateKey)"
            >
              {{ day.date.getDate() }}
            </button>
          </div>

          <div class="admin-date__actions">
            <button type="button" class="admin-date__action" @click="clearDate">Limpar</button>
            <button type="button" class="admin-date__action admin-date__action--primary" @click="goToday">Hoje</button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.admin-date {
  position: relative;
  display: inline-block;
}

.admin-date__trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-ink);
  padding: 10px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard);
}

.admin-date__trigger svg {
  flex-shrink: 0;
  color: var(--color-rose-700);
}

.admin-date__trigger:hover {
  border-color: var(--color-rose-500);
}

.admin-date__trigger--open {
  border-color: var(--color-rose-700);
  box-shadow: 0 0 0 3px var(--color-rose-100);
}

.admin-date__panel {
  position: fixed;
  z-index: 210;
  width: 280px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: var(--space-4);
}

.admin-date__nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
}

.admin-date__month {
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--color-rose-900);
  text-transform: capitalize;
  font-size: 0.95rem;
}

.admin-date__nav-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-standard), background var(--duration-fast) var(--ease-standard);
}

.admin-date__nav-btn:hover {
  border-color: var(--color-rose-500);
  background: var(--color-rose-100);
}

.admin-date__weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: 4px;
}

.admin-date__weekdays span {
  text-align: center;
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--color-ink-soft);
}

.admin-date__grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.admin-date__day {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  border-radius: 50%;
  font-size: 0.82rem;
  color: var(--color-ink);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard);
}

.admin-date__day:hover {
  background: var(--color-rose-100);
}

.admin-date__day--muted {
  color: var(--color-ink-soft);
  opacity: 0.5;
}

.admin-date__day--today {
  font-weight: 800;
  color: var(--color-rose-700);
  box-shadow: inset 0 0 0 1.5px var(--color-rose-300);
}

.admin-date__day--selected {
  background: linear-gradient(135deg, var(--color-rose-700), var(--color-rose-900));
  color: #fff;
  font-weight: 700;
}

.admin-date__day--disabled {
  color: var(--color-ink-soft);
  opacity: 0.3;
  cursor: not-allowed;
}

.admin-date__day--disabled:hover {
  background: none;
}

.admin-date__actions {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}

.admin-date__action {
  background: none;
  border: none;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--color-ink-muted);
  cursor: pointer;
  padding: 4px 6px;
}

.admin-date__action:hover {
  text-decoration: underline;
}

.admin-date__action--primary {
  color: var(--color-rose-700);
}

.admin-date-pop-enter-active,
.admin-date-pop-leave-active {
  transition: opacity 0.18s var(--ease-premium), transform 0.18s var(--ease-premium);
}

.admin-date-pop-enter-from,
.admin-date-pop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.97);
}

@media (prefers-reduced-motion: reduce) {
  .admin-date-pop-enter-active,
  .admin-date-pop-leave-active {
    transition: none;
  }
}
</style>
