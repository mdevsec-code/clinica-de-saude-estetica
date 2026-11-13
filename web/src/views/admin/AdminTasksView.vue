<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { apiRequest, ApiError } from '@/services/api';
import { toLocalDateKey } from '@/utils/calendar';

// Quadro de tarefas da semana (estilo Trello), um só para a equipe toda:
// uma coluna por dia, de segunda a sábado, com as datas da semana que está
// na tela. Arrastar leva a tarefa para outro dia (no celular: "Mover
// para…"). Atualiza sozinho a cada 20 s para cada pessoa ver o que a outra
// mudou.

interface Task {
  id: string;
  date: string; // ISO (meia-noite UTC do dia)
  title: string;
  done: boolean;
  position: number;
  createdByName: string | null;
}

const DAY_NAMES = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function mondayOf(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const wd = (x.getDay() + 6) % 7; // segunda = 0
  x.setDate(x.getDate() - wd);
  return x;
}

const weekStart = ref(mondayOf(new Date()));
const days = computed(() =>
  DAY_NAMES.map((name, i) => {
    const d = new Date(weekStart.value);
    d.setDate(d.getDate() + i);
    return { name, key: toLocalDateKey(d), label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) };
  }),
);
const todayKey = toLocalDateKey(new Date());
const isThisWeek = computed(() => toLocalDateKey(weekStart.value) === toLocalDateKey(mondayOf(new Date())));
const weekLabel = computed(() => `${days.value[0].label} a ${days.value[5].label}`);

function shiftWeek(n: number) {
  const d = new Date(weekStart.value);
  d.setDate(d.getDate() + 7 * n);
  weekStart.value = d;
}

const tasks = ref<Task[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const byDay = computed(() => {
  const map: Record<string, Task[]> = {};
  for (const d of days.value) map[d.key] = [];
  for (const t of tasks.value) map[t.date.slice(0, 10)]?.push(t);
  return map;
});

async function load(silent = false) {
  if (!silent) loading.value = true;
  try {
    const { tasks: data } = await apiRequest<{ tasks: Task[] }>(`/tasks?from=${days.value[0].key}&to=${days.value[5].key}`);
    tasks.value = data;
    error.value = null;
  } catch (err) {
    if (!silent) error.value = err instanceof ApiError ? err.message : 'Não foi possível carregar as tarefas.';
  } finally {
    loading.value = false;
  }
}
watch(weekStart, () => load());

// --- criar / editar / concluir / apagar ---
const drafts = reactive<Record<string, string>>({});
async function addTask(dayKey: string) {
  const title = (drafts[dayKey] ?? '').trim();
  if (!title) return;
  drafts[dayKey] = '';
  try {
    const { task } = await apiRequest<{ task: Task }>('/tasks', { method: 'POST', body: JSON.stringify({ date: dayKey, title }) });
    tasks.value.push(task);
  } catch {
    drafts[dayKey] = title;
  }
}

async function patch(task: Task, data: Partial<Pick<Task, 'title' | 'done' | 'position'>> & { date?: string }) {
  const before = { ...task };
  Object.assign(task, data, data.date ? { date: `${data.date}T00:00:00.000Z` } : {});
  try {
    await apiRequest(`/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify(data) });
  } catch {
    Object.assign(task, before);
  }
}

const editingId = ref<string | null>(null);
const editText = ref('');
function startEdit(task: Task) {
  editingId.value = task.id;
  editText.value = task.title;
}
function saveEdit(task: Task) {
  const title = editText.value.trim();
  editingId.value = null;
  if (title && title !== task.title) patch(task, { title });
}

const confirmingDelete = ref<string | null>(null);
async function remove(task: Task) {
  if (confirmingDelete.value !== task.id) {
    confirmingDelete.value = task.id;
    return;
  }
  confirmingDelete.value = null;
  tasks.value = tasks.value.filter((t) => t.id !== task.id);
  try {
    await apiRequest(`/tasks/${task.id}`, { method: 'DELETE' });
  } catch {
    load(true);
  }
}

// --- arrastar entre dias ---
const dragId = ref<string | null>(null);
const dropDay = ref<string | null>(null);
function onDrop(dayKey: string) {
  const task = tasks.value.find((t) => t.id === dragId.value);
  dragId.value = null;
  dropDay.value = null;
  if (!task || task.date.slice(0, 10) === dayKey) return;
  const last = byDay.value[dayKey].at(-1);
  patch(task, { date: dayKey, position: (last?.position ?? 0) + 1 });
}

// --- atualização automática (quadro compartilhado) ---
let timer: ReturnType<typeof setInterval> | undefined;
const refresh = () => {
  if (document.visibilityState === 'visible' && !editingId.value && !dragId.value) load(true);
};
onMounted(() => {
  load();
  timer = setInterval(refresh, 20_000);
  document.addEventListener('visibilitychange', refresh);
});
onUnmounted(() => {
  clearInterval(timer);
  document.removeEventListener('visibilitychange', refresh);
});

const doneCount = computed(() => tasks.value.filter((t) => t.done).length);
</script>

<template>
  <div class="tasks">
    <div class="tasks__header">
      <div>
        <h1>Tarefas da semana</h1>
        <p>Quadro da equipe: o que a Noely e a recepção anotam aparece aqui para todas.</p>
      </div>
      <div class="tasks__nav">
        <button type="button" class="tasks__nav-btn" aria-label="Semana anterior" @click="shiftWeek(-1)">‹</button>
        <span class="tasks__week">{{ weekLabel }}</span>
        <button type="button" class="tasks__nav-btn" aria-label="Próxima semana" @click="shiftWeek(1)">›</button>
        <button v-if="!isThisWeek" type="button" class="button button--ghost tasks__today" @click="weekStart = mondayOf(new Date())">Esta semana</button>
      </div>
    </div>
    <p v-if="tasks.length" class="tasks__progress">{{ doneCount }} de {{ tasks.length }} concluídas nesta semana</p>
    <p v-if="error" class="admin-error">{{ error }}</p>

    <div class="tasks__board" :class="{ 'tasks__board--loading': loading }">
      <section
        v-for="d in days"
        :key="d.key"
        class="tasks__col"
        :class="{ 'tasks__col--today': d.key === todayKey, 'tasks__col--drop': dropDay === d.key }"
        @dragover.prevent="dropDay = d.key"
        @dragleave="dropDay === d.key && (dropDay = null)"
        @drop.prevent="onDrop(d.key)"
      >
        <header class="tasks__col-head">
          <span class="tasks__day">{{ d.name }}</span>
          <span class="tasks__date">{{ d.label }}</span>
          <span v-if="byDay[d.key].length" class="tasks__count">{{ byDay[d.key].filter((t) => t.done).length }}/{{ byDay[d.key].length }}</span>
        </header>

        <ul class="tasks__list">
          <li
            v-for="t in byDay[d.key]"
            :key="t.id"
            class="tasks__card"
            :class="{ 'tasks__card--done': t.done, 'tasks__card--dragging': dragId === t.id }"
            draggable="true"
            @dragstart="dragId = t.id"
            @dragend="dragId = null; dropDay = null"
          >
            <label class="tasks__check">
              <input type="checkbox" :checked="t.done" :aria-label="`Concluir: ${t.title}`" @change="patch(t, { done: !t.done })" />
              <span aria-hidden="true" />
            </label>
            <div class="tasks__body">
              <input
                v-if="editingId === t.id"
                v-model="editText"
                class="tasks__edit"
                maxlength="300"
                @keydown.enter="saveEdit(t)"
                @keydown.esc="editingId = null"
                @blur="saveEdit(t)"
              />
              <button v-else type="button" class="tasks__title" title="Tocar para editar" @click="startEdit(t)">{{ t.title }}</button>
              <div class="tasks__meta">
                <small v-if="t.createdByName">{{ t.createdByName }}</small>
                <select class="tasks__move" :value="t.date.slice(0, 10)" aria-label="Mover para outro dia" @change="patch(t, { date: ($event.target as HTMLSelectElement).value })">
                  <option v-for="o in days" :key="o.key" :value="o.key">{{ o.name }} {{ o.label }}</option>
                </select>
                <button type="button" class="tasks__del" :class="{ 'tasks__del--confirm': confirmingDelete === t.id }" @click="remove(t)">
                  {{ confirmingDelete === t.id ? 'Apagar?' : '×' }}
                </button>
              </div>
            </div>
          </li>
        </ul>

        <form class="tasks__add" @submit.prevent="addTask(d.key)">
          <input v-model="drafts[d.key]" type="text" maxlength="300" :placeholder="`+ Adicionar tarefa`" :aria-label="`Nova tarefa para ${d.name}`" />
        </form>
      </section>
    </div>
  </div>
</template>

<style scoped>
.tasks__header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-3);
}

.tasks__header p {
  color: var(--color-ink-muted);
}

.tasks__nav {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.tasks__nav-btn {
  width: 40px;
  height: 40px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  font-size: 1.2rem;
  color: var(--color-ink);
}

.tasks__week {
  min-width: 120px;
  text-align: center;
  font-weight: 700;
}

.tasks__today {
  padding: 8px 14px;
  font-size: 0.85rem;
}

.tasks__progress {
  margin: 0 0 var(--space-4);
  font-size: 0.85rem;
  color: var(--color-ink-muted);
}

.tasks__board {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--space-3);
  align-items: start;
  transition: opacity 0.2s ease;
}

.tasks__board--loading {
  opacity: 0.55;
}

.tasks__col {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-height: 220px;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
  transition: border-color 0.15s ease, background 0.15s ease;
}

.tasks__col--today {
  border-color: var(--color-rose-500);
  box-shadow: inset 0 3px 0 var(--color-fill-700);
}

.tasks__col--drop {
  border-style: dashed;
  border-color: var(--color-fill-700);
  background: var(--color-rose-100);
}

.tasks__col-head {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}

.tasks__day {
  font-weight: 700;
  color: var(--color-ink);
}

.tasks__date {
  font-size: 0.85rem;
  color: var(--color-ink-muted);
}

.tasks__count {
  margin-left: auto;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-ink-soft);
}

.tasks__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.tasks__card {
  display: flex;
  gap: var(--space-2);
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  box-shadow: 0 4px 12px -10px rgba(28, 18, 16, 0.5);
}

.tasks__card--dragging {
  opacity: 0.4;
}

.tasks__check {
  position: relative;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  margin-top: 1px;
}

.tasks__check input {
  position: absolute;
  inset: 0;
  z-index: 1;
  opacity: 0;
  margin: 0;
  cursor: pointer;
}

.tasks__check span {
  position: absolute;
  inset: 0;
  pointer-events: none;
  border: 2px solid var(--color-rose-300);
  border-radius: 6px;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.tasks__check input:checked + span {
  background: var(--color-success);
  border-color: var(--color-success);
}

.tasks__check input:checked + span::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 1px;
  width: 5px;
  height: 10px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.tasks__check input:focus-visible + span {
  box-shadow: 0 0 0 3px var(--color-rose-100);
}

.tasks__body {
  flex: 1;
  min-width: 0;
}

.tasks__title {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 0.9rem;
  text-align: left;
  color: var(--color-ink);
  overflow-wrap: anywhere;
}

.tasks__card--done .tasks__title {
  text-decoration: line-through;
  color: var(--color-ink-soft);
}

.tasks__edit {
  width: 100%;
  font: inherit;
  font-size: 0.9rem;
  padding: 4px 6px;
  border: 1px solid var(--color-rose-500);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-ink);
}

.tasks__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.tasks__meta small {
  font-size: 0.72rem;
  color: var(--color-ink-soft);
}

/* "Mover para…" só onde não dá para arrastar (toque) ou a coluna é estreita;
   no computador arrasta-se o cartão. */
.tasks__move {
  display: none;
  max-width: 120px;
  padding: 2px 4px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  font-size: 0.72rem;
  color: var(--color-ink-muted);
}

.tasks__del {
  margin-left: auto;
  min-width: 24px;
  height: 24px;
  padding: 0 4px;
  border: 0;
  border-radius: var(--radius-pill);
  background: none;
  color: var(--color-ink-soft);
}

.tasks__del--confirm {
  padding: 0 8px;
  background: var(--color-danger);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
}

.tasks__add input {
  width: 100%;
  padding: 9px 10px;
  border: 1px dashed var(--color-rose-300);
  border-radius: var(--radius-sm);
  background: transparent;
  font: inherit;
  font-size: 0.85rem;
  color: var(--color-ink);
}

.tasks__add input:focus {
  border-style: solid;
  background: var(--color-surface);
  outline: none;
}

@media (hover: none), (max-width: 1100px) {
  .tasks__move {
    display: block;
  }
}

/* Tablet: 3 colunas; celular: um dia embaixo do outro. */
@media (max-width: 1100px) {
  .tasks__board {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .tasks__board {
    grid-template-columns: minmax(0, 1fr);
  }

  .tasks__col {
    min-height: 0;
  }
}
</style>
