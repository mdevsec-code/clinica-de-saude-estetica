<script setup lang="ts" generic="T extends string">
// Substitui <select> nativo: o CAMPO fechado já dava pra estilizar (setinha
// custom, borda, foco — era o que existia antes), mas a LISTA de opções
// aberta é desenhada pelo sistema operacional e fica fora do alcance do CSS
// em praticamente todo navegador — lia como um elemento de outro site
// dentro do painel. Mesma arquitetura do AdminDatePicker.vue (o mesmo
// problema já resolvido ali para o calendário): painel teleportado,
// posicionado via getBoundingClientRect, fecha em click-fora/Escape/scroll.
//
// Genérico em T (não só `string`): vários usos fazem v-model num union type
// estreito (ExpenseStatus, UserRole...), não um `string` solto — sem o
// componente ser genérico, todo v-model desses precisaria de um cast manual
// no call site só pra satisfazer o checker.
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';

export interface AdminSelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface AdminSelectGroup<T extends string = string> {
  label: string;
  options: AdminSelectOption<T>[];
}

const props = withDefaults(
  defineProps<{
    modelValue: T;
    options: (AdminSelectOption<T> | AdminSelectGroup<T>)[];
    placeholder?: string;
    disabled?: boolean;
  }>(),
  { placeholder: 'Selecionar', disabled: false },
);
const emit = defineEmits<{ 'update:modelValue': [value: T] }>();

function isGroup(item: AdminSelectOption<T> | AdminSelectGroup<T>): item is AdminSelectGroup<T> {
  return 'options' in item;
}

// Achata grupos pra uma lista única de opções reais (pra achar o label do
// valor selecionado sem duplicar a lógica de "é grupo ou não" em outro
// lugar) — a estrutura agrupada original continua intacta pro template.
const flatOptions = computed<AdminSelectOption<T>[]>(() =>
  props.options.flatMap((item) => (isGroup(item) ? item.options : [item])),
);

const selectedLabel = computed(() => flatOptions.value.find((o) => o.value === props.modelValue)?.label ?? props.placeholder);

const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const open = ref(false);
const panelPos = ref({ top: 0, left: 0, width: 0 });

// Teleportado pro mesmo motivo do AdminDatePicker: um <select> aberto dentro
// de um .admin-card com overflow:hidden/clip cortaria a lista pela metade
// sempre que não sobrasse altura abaixo do campo dentro do card.
function positionPanel() {
  if (!trigger.value) return;
  const rect = trigger.value.getBoundingClientRect();
  const minWidth = Math.max(rect.width, 200);

  const panelHeight = panel.value?.getBoundingClientRect().height || 260;
  const spaceBelow = window.innerHeight - rect.bottom;
  let top = rect.bottom + 6;
  if (spaceBelow < panelHeight + 12 && rect.top > panelHeight + 12) {
    top = rect.top - panelHeight - 6;
  }
  top = Math.max(12, Math.min(top, window.innerHeight - panelHeight - 12));

  let left = rect.left;
  if (left + minWidth > window.innerWidth - 12) {
    left = Math.max(12, window.innerWidth - minWidth - 12);
  }

  panelPos.value = { top, left, width: minWidth };
}

async function toggle() {
  if (props.disabled) return;
  if (open.value) {
    open.value = false;
    return;
  }
  open.value = true;
  await nextTick();
  positionPanel();
}

function selectOption(option: AdminSelectOption<T>) {
  if (option.disabled) return;
  emit('update:modelValue', option.value);
  open.value = false;
  trigger.value?.focus();
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

// Mesma escolha do AdminDatePicker: fecha em vez de "seguir" o gatilho
// durante o scroll — mais simples e previsível do que recalcular a posição
// a cada frame.
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
</script>

<template>
  <div ref="root" class="admin-select">
    <button
      ref="trigger"
      type="button"
      class="admin-select__trigger"
      :class="{ 'admin-select__trigger--open': open, 'admin-select__trigger--placeholder': !modelValue }"
      :disabled="disabled"
      @click="toggle"
    >
      <span>{{ selectedLabel }}</span>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>

    <Teleport to="#overlay-slot">
      <Transition name="admin-select-pop">
        <ul
          v-if="open"
          ref="panel"
          class="admin-select__panel"
          role="listbox"
          :style="{ top: `${panelPos.top}px`, left: `${panelPos.left}px`, minWidth: `${panelPos.width}px` }"
        >
          <template v-for="(item, i) in options" :key="i">
            <li v-if="isGroup(item)" class="admin-select__group-label">{{ item.label }}</li>
            <li
              v-for="option in isGroup(item) ? item.options : [item]"
              :key="option.value"
              role="option"
              :aria-selected="option.value === modelValue"
              class="admin-select__option"
              :class="{
                'admin-select__option--selected': option.value === modelValue,
                'admin-select__option--disabled': option.disabled,
                'admin-select__option--grouped': isGroup(item),
              }"
              @click="selectOption(option)"
            >
              <span>{{ option.label }}</span>
              <svg v-if="option.value === modelValue" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
            </li>
          </template>
        </ul>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.admin-select {
  position: relative;
  display: block;
  width: 100%;
}

.admin-select__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 400;
  color: var(--color-ink);
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background-color: var(--color-bg);
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard);
}

.admin-select__trigger--placeholder {
  color: var(--color-ink-soft);
}

.admin-select__trigger svg {
  flex-shrink: 0;
  color: var(--color-rose-700);
  transition: transform var(--duration-fast) var(--ease-standard);
}

.admin-select__trigger--open svg {
  transform: rotate(180deg);
}

.admin-select__trigger:hover {
  border-color: var(--color-rose-500);
}

.admin-select__trigger--open {
  border-color: var(--color-rose-700);
  box-shadow: 0 0 0 3px var(--color-rose-100);
}

.admin-select__trigger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.admin-select__panel {
  position: fixed;
  z-index: 210;
  max-height: min(320px, 60vh);
  overflow-y: auto;
  list-style: none;
  margin: 0;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: 6px;
}

.admin-select__group-label {
  padding: 8px 10px 4px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-ink-soft);
}

.admin-select__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  font-size: 0.92rem;
  color: var(--color-ink);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard);
}

.admin-select__option--grouped {
  padding-left: 22px;
}

.admin-select__option svg {
  flex-shrink: 0;
  color: var(--color-rose-700);
}

.admin-select__option:hover {
  background: var(--color-rose-100);
}

.admin-select__option--selected {
  font-weight: 700;
  color: var(--color-rose-900);
  background: var(--color-rose-100);
}

.admin-select__option--disabled {
  color: var(--color-ink-soft);
  cursor: not-allowed;
}

.admin-select__option--disabled:hover {
  background: none;
}

.admin-select-pop-enter-active,
.admin-select-pop-leave-active {
  transition: opacity 0.18s var(--ease-premium), transform 0.18s var(--ease-premium);
}

.admin-select-pop-enter-from,
.admin-select-pop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.97);
}

@media (prefers-reduced-motion: reduce) {
  .admin-select-pop-enter-active,
  .admin-select-pop-leave-active {
    transition: none;
  }
}
</style>
