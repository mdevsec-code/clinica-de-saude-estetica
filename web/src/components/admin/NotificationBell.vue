<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { apiRequest } from '@/services/api';
import { useAuthStore } from '@/stores/auth';

// Sino do painel: a cada 15 s busca as últimas mudanças da agenda (cliente
// agendou pelo site, confirmou/remarcou pelo WhatsApp, alguém da equipe
// marcou ou desmarcou). Novidade → toca o sino e mostra a prévia embaixo
// dele; clicar abre o histórico (as 5 mais recentes). Quem fez a ação não
// ouve o próprio sino.

interface AppNotification {
  id: string;
  // TASKS é aviso do próprio painel (não vem do servidor).
  kind: 'BOOKED' | 'CANCELLED' | 'CONFIRMED' | 'RESCHEDULED' | 'TASKS';
  title: string;
  body: string;
  actorUserId: string | null;
  createdAt: string;
}

const POLL_MS = 15_000;
const SEEN_KEY = 'noely-notif-seen';
const auth = useAuthStore();

const items = ref<AppNotification[]>([]);
const open = ref(false);
const preview = ref<AppNotification | null>(null);
const seenAt = ref(readSeen());
let newestKnown = '';
let previewTimer: ReturnType<typeof setTimeout> | undefined;

function readSeen() {
  try {
    return localStorage.getItem(SEEN_KEY) ?? '';
  } catch {
    return '';
  }
}

const fromOthers = (n: AppNotification) => n.actorUserId !== auth.user?.id;
const unread = computed(() => items.value.filter((n) => fromOthers(n) && n.createdAt > seenAt.value).length);

// Som de sino feito no próprio navegador (sem arquivo de áudio): duas notas
// com brilho metálico que somem devagar. O navegador só deixa tocar depois
// do primeiro toque/clique na página — por isso o contexto nasce aí.
let audio: AudioContext | null = null;
function unlockAudio() {
  if (!audio) audio = new AudioContext();
  if (audio.state === 'suspended') audio.resume();
}
function ring() {
  if (!audio || audio.state !== 'running') return;
  const now = audio.currentTime;
  for (const [freq, delay] of [[1318.5, 0], [987.8, 0.18]] as const) {
    for (const [mult, gain] of [[1, 0.22], [2.76, 0.06], [5.4, 0.025]] as const) {
      const osc = audio.createOscillator();
      const env = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      env.gain.setValueAtTime(0, now + delay);
      env.gain.linearRampToValueAtTime(gain, now + delay + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, now + delay + 1.6);
      osc.connect(env).connect(audio.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 1.7);
    }
  }
}

async function poll() {
  try {
    const { notifications } = await apiRequest<{ notifications: AppNotification[] }>('/notifications');
    const first = !newestKnown;
    const fresh = first ? [] : notifications.filter((n) => n.createdAt > newestKnown && fromOthers(n));
    items.value = notifications;
    if (notifications[0]) newestKnown = notifications[0].createdAt;
    else if (first) newestKnown = new Date(0).toISOString();
    if (fresh.length) {
      ring();
      preview.value = fresh[0];
      clearTimeout(previewTimer);
      previewTimer = setTimeout(() => (preview.value = null), 7000);
    }
  } catch {
    // sem rede ou sessão expirada: tenta de novo na próxima rodada
  }
}

// Aviso local: toca o sino e mostra a prévia, sem ir para o histórico.
function localAlert(kind: 'TASKS', title: string, body: string, ms: number) {
  ring();
  preview.value = { id: `${kind}-${Date.now()}`, kind, title, body, actorUserId: null, createdAt: new Date().toISOString() };
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => (preview.value = null), ms);
}

// Tarefas do dia: na primeira abertura do painel no dia, se houver tarefa
// pendente para hoje no quadro, o sino toca e lista.
const TASKS_KEY = 'noely-tasks-alerted';
async function alertTodayTasks() {
  const today = new Date().toLocaleDateString('sv-SE'); // yyyy-MM-dd local
  try {
    if (localStorage.getItem(TASKS_KEY) === today) return;
  } catch {
    // sem localStorage: avisa nesta visita
  }
  try {
    const { tasks } = await apiRequest<{ tasks: { title: string; done: boolean }[] }>(`/tasks?from=${today}&to=${today}`);
    const pending = tasks.filter((t) => !t.done);
    if (!pending.length) return;
    try {
      localStorage.setItem(TASKS_KEY, today);
    } catch {
      // idem
    }
    const list = pending.slice(0, 3).map((t) => t.title).join(' · ');
    localAlert('TASKS', `${pending.length} tarefa(s) para hoje`, pending.length > 3 ? `${list} · …` : list, 20_000);
  } catch {
    // sem rede: tenta na próxima abertura
  }
}

// Recepção: contagem regressiva de 15 min para olhar o WhatsApp Web. Ao zerar,
// o sino toca a cada 5 s até a pessoa clicar em "Vou olhar". O prazo fica no
// navegador, então recarregar a página (ou outra aba) não zera a contagem.
const isReception = computed(() => auth.user?.role === 'RECEPTION');
const WA_EVERY_MS = 15 * 60_000;
// Chave nova ao mudar o intervalo: descarta prazos salvos com o intervalo antigo.
const WA_KEY = 'noely-whatsapp-deadline-15';
const now = ref(Date.now());
const waDeadline = ref(0);
function readWaDeadline() {
  try {
    const saved = Number(localStorage.getItem(WA_KEY));
    if (saved) waDeadline.value = saved;
  } catch {
    // sem localStorage: vale só nesta aba
  }
}
function resetWhatsapp() {
  waDeadline.value = Date.now() + WA_EVERY_MS;
  now.value = Date.now();
  try {
    localStorage.setItem(WA_KEY, String(waDeadline.value));
  } catch {
    // idem
  }
}
const waLeftMs = computed(() => Math.max(0, waDeadline.value - now.value));
const waDue = computed(() => isReception.value && waDeadline.value > 0 && waLeftMs.value === 0);
const waLabel = computed(() => {
  const sec = Math.ceil(waLeftMs.value / 1000);
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
});
function tickWhatsapp() {
  readWaDeadline();
  now.value = Date.now();
  if (waDue.value && Math.floor(now.value / 1000) % 5 === 0) ring();
}

function toggle() {
  open.value = !open.value;
  preview.value = null;
  if (open.value && items.value[0]) {
    seenAt.value = items.value[0].createdAt;
    try {
      localStorage.setItem(SEEN_KEY, seenAt.value);
    } catch {
      // navegação privada: só nesta visita
    }
  }
}

function onDocClick(e: MouseEvent) {
  if (open.value && !(e.target as Element).closest('.bell')) open.value = false;
}
const onVisible = () => document.visibilityState === 'visible' && poll();

let timer: ReturnType<typeof setInterval> | undefined;
let whatsappTimer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  poll();
  timer = setInterval(poll, POLL_MS);
  // Depois do primeiro toque na página: antes disso o navegador não deixa tocar.
  document.addEventListener('pointerdown', () => setTimeout(alertTodayTasks, 300), { once: true });
  if (isReception.value) {
    readWaDeadline();
    if (!waDeadline.value) resetWhatsapp();
    whatsappTimer = setInterval(tickWhatsapp, 1000);
  }
  document.addEventListener('pointerdown', unlockAudio);
  document.addEventListener('click', onDocClick);
  document.addEventListener('visibilitychange', onVisible);
});
onUnmounted(() => {
  clearInterval(timer);
  clearInterval(whatsappTimer);
  clearTimeout(previewTimer);
  document.removeEventListener('pointerdown', unlockAudio);
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('visibilitychange', onVisible);
});

const ICON: Record<AppNotification['kind'], string> = { BOOKED: '＋', CANCELLED: '✕', CONFIRMED: '✓', RESCHEDULED: '↻', TASKS: '☰' };
function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
</script>

<template>
  <div class="bell">
    <div v-if="isReception" class="bell__wa" :class="{ 'bell__wa--due': waDue }" role="timer" aria-live="polite">
      <template v-if="waDue">
        <span class="bell__wa-long">Olhe o WhatsApp Web</span>
        <button type="button" class="bell__wa-ok" @click="resetWhatsapp">Vou olhar<span class="bell__wa-short"> o WhatsApp</span></button>
      </template>
      <span v-else :aria-label="`WhatsApp em ${waLabel}`"><span class="bell__wa-long">WhatsApp em </span><svg class="bell__wa-short bell__wa-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 20.5 5 16a8.5 8.5 0 1 1 3 3l-4.5 1.5Z" /></svg><strong>{{ waLabel }}</strong></span>
    </div>
    <button
      type="button"
      class="bell__btn"
      :class="{ 'bell__btn--ring': preview }"
      :aria-label="unread ? `Notificações: ${unread} nova(s)` : 'Notificações'"
      :aria-expanded="open"
      @click="toggle"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
      <span v-if="unread" class="bell__badge">{{ unread }}</span>
    </button>

    <Transition name="bell-pop">
      <div v-if="preview && !open" class="bell__panel bell__panel--preview" role="status">
        <span class="bell__icon" :class="`bell__icon--${preview.kind.toLowerCase()}`">{{ ICON[preview.kind] }}</span>
        <div>
          <p class="bell__title">{{ preview.title }}</p>
          <p class="bell__body">{{ preview.body }}</p>
        </div>
      </div>
    </Transition>

    <Transition name="bell-pop">
      <div v-if="open" class="bell__panel" role="dialog" aria-label="Últimas notificações">
        <p class="bell__head">Últimas atualizações da agenda</p>
        <p v-if="!items.length" class="bell__empty">Nada por aqui ainda. Quando uma cliente agendar, confirmar ou desmarcar, aparece aqui.</p>
        <ul v-else class="bell__list">
          <li v-for="n in items" :key="n.id" class="bell__item">
            <span class="bell__icon" :class="`bell__icon--${n.kind.toLowerCase()}`">{{ ICON[n.kind] }}</span>
            <div>
              <p class="bell__title">{{ n.title }} <small>{{ ago(n.createdAt) }}</small></p>
              <p class="bell__body">{{ n.body }}</p>
            </div>
          </li>
        </ul>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.bell {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.bell__wa {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 42px;
  padding: 0 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-ink-soft);
  font-size: 0.85rem;
  white-space: nowrap;
}

.bell__wa strong {
  color: var(--color-ink);
  font-variant-numeric: tabular-nums;
}

.bell__wa--due {
  padding-right: 5px;
  border-color: transparent;
  background: var(--color-fill-700);
  color: #fff;
  font-weight: 700;
  animation: bell-wa-pulse 1.2s ease-in-out infinite;
}

.bell__wa-ok {
  height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--radius-pill);
  background: #fff;
  color: var(--color-fill-900);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.bell__wa-short {
  display: none;
}

.bell__wa-icon {
  flex: none;
  margin-right: 4px;
  vertical-align: -2px;
}

@media (max-width: 600px) {
  /* Na linha do topo não cabe (empurra o Sair para fora): fica logo abaixo do sino. */
  .bell__wa {
    position: fixed;
    top: calc(env(safe-area-inset-top, 0px) + 66px);
    right: 12px;
    z-index: 44;
    height: 36px;
    padding: 0 12px;
    box-shadow: var(--shadow-sm);
  }
  .bell__wa--due {
    padding: 0 5px;
  }
  .bell__wa-long {
    display: none;
  }
  .bell__wa-short {
    display: inline;
  }
}

@keyframes bell-wa-pulse {
  50% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--color-fill-700) 30%, transparent); }
}

@media (prefers-reduced-motion: reduce) {
  .bell__wa--due { animation: none; }
}

.bell__btn {
  position: relative;
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-surface);
  color: var(--color-ink);
  box-shadow: 0 6px 18px -10px rgba(28, 18, 16, 0.35);
}

.bell__btn--ring svg {
  animation: bell-swing 0.9s ease-in-out 2;
  transform-origin: 50% 10%;
}

@keyframes bell-swing {
  0%, 100% { transform: rotate(0); }
  20% { transform: rotate(16deg); }
  40% { transform: rotate(-13deg); }
  60% { transform: rotate(8deg); }
  80% { transform: rotate(-4deg); }
}

.bell__badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 19px;
  height: 19px;
  padding: 0 5px;
  border-radius: var(--radius-pill);
  background: var(--color-danger);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 19px;
  text-align: center;
}

.bell__panel {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 60;
  width: min(340px, calc(100vw - 24px));
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow: 0 18px 44px -18px rgba(28, 18, 16, 0.5);
}

/* Celular: o sino fica no meio da barra; a janela abre embaixo da barra,
   na largura da tela (ancorada no sino, saía pela esquerda). */
@media (max-width: 600px) {
  .bell__panel {
    position: fixed;
    top: 72px;
    left: 12px;
    right: 12px;
    width: auto;
  }
}

.bell__panel--preview {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  border-color: var(--color-rose-300);
}

.bell__head {
  margin: 0 0 var(--space-2);
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-ink-muted);
}

.bell__empty {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-ink-muted);
}

.bell__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.bell__item {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-top: 1px solid var(--color-border);
}

.bell__item:first-child {
  border-top: 0;
}

.bell__icon {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-size: 0.85rem;
  font-weight: 700;
  background: var(--color-rose-100);
  color: var(--color-rose-900);
}

.bell__icon--confirmed,
.bell__icon--rescheduled {
  background: var(--color-success-bg);
  color: var(--color-success-ink);
}

.bell__icon--cancelled {
  background: var(--color-danger-bg);
  color: var(--color-danger-ink);
}

.bell__title {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-ink);
}

.bell__title small {
  font-weight: 500;
  color: var(--color-ink-soft);
}

.bell__body {
  margin: 2px 0 0;
  font-size: 0.82rem;
  color: var(--color-ink-muted);
  overflow-wrap: anywhere;
}

.bell-pop-enter-active,
.bell-pop-leave-active {
  transition: opacity 0.2s ease, transform 0.25s var(--ease-premium);
}

.bell-pop-enter-from,
.bell-pop-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
