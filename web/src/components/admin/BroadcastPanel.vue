<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { ApiError, apiRequest } from '@/services/api';
import { formatWhatsapp } from '@/utils/whatsapp-format';

// Lista de transmissão: uma mensagem para os contatos salvos no celular da
// clínica e/ou as pacientes do sistema. O servidor envia devagar (1 a cada
// 20–40 s, 8h–20h, até 200/dia) para o WhatsApp não restringir o número.

interface Broadcast {
  id: string;
  status: 'RUNNING' | 'DONE' | 'CANCELLED';
  total: number;
  sent: number;
  failed: number;
  createdByName: string | null;
  createdAt: string;
  finishedAt: string | null;
}
interface BroadcastInfo {
  audience: { contacts: number; patients: number; both: number };
  broadcasts: Broadcast[];
  defaultMessage: string;
  preview: string;
}

const props = defineProps<{ connected: boolean }>();

const info = ref<BroadcastInfo | null>(null);
const message = ref('');
const preview = ref('');
const useContacts = ref(true);
const usePatients = ref(true);
const busy = ref(false);
const syncing = ref(false);
const feedback = ref<string | null>(null);
const error = ref<string | null>(null);

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Não foi possível falar com o servidor.');

async function load() {
  const data = await apiRequest<BroadcastInfo>('/whatsapp/broadcast');
  if (!info.value) {
    message.value = data.defaultMessage;
    preview.value = data.preview;
  }
  info.value = data;
}

const running = computed(() => info.value?.broadcasts.find((b) => b.status === 'RUNNING') ?? null);
const total = computed(() => {
  const a = info.value?.audience;
  if (!a) return 0;
  if (useContacts.value && usePatients.value) return a.both;
  return (useContacts.value ? a.contacts : 0) + (usePatients.value ? a.patients : 0);
});
// ~30 s por mensagem, 12 h por dia, no máximo 200 por dia.
const estimate = computed(() => {
  const n = total.value;
  if (!n) return '';
  const days = Math.ceil(n / 200);
  if (days > 1) return `cerca de ${days} dias (até 200 por dia)`;
  const min = Math.ceil((n * 30) / 60);
  return min < 60 ? `cerca de ${min} min` : `cerca de ${Math.ceil(min / 60)} h`;
});
const previewLines = computed(() => formatWhatsapp(preview.value));

let previewTimer: ReturnType<typeof setTimeout> | undefined;
watch(message, (text) => {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(async () => {
    if (!text.trim()) return (preview.value = '');
    try {
      preview.value = (await apiRequest<{ preview: string }>('/whatsapp/broadcast/preview', { method: 'POST', body: JSON.stringify({ message: text }) })).preview;
    } catch {
      // prévia é só ajuda visual
    }
  }, 400);
});

async function syncContacts() {
  syncing.value = true;
  error.value = feedback.value = null;
  try {
    await apiRequest('/whatsapp/contacts/sync', { method: 'POST' });
    feedback.value = 'Pedimos a agenda ao celular — os contatos chegam em alguns segundos.';
    setTimeout(() => load().catch(() => {}), 6000);
  } catch (e) {
    error.value = errorText(e);
  } finally {
    syncing.value = false;
  }
}

async function start() {
  const sources = [useContacts.value && 'contacts', usePatients.value && 'patients'].filter(Boolean);
  if (!window.confirm(`Enviar esta mensagem para ${total.value} contato(s)? Leva ${estimate.value}. Dá para cancelar a qualquer momento.`)) return;
  busy.value = true;
  error.value = feedback.value = null;
  try {
    await apiRequest('/whatsapp/broadcast', { method: 'POST', body: JSON.stringify({ message: message.value, sources }) });
    feedback.value = 'Transmissão iniciada. Pode fechar o painel — o envio continua no servidor.';
    await load();
  } catch (e) {
    error.value = errorText(e);
  } finally {
    busy.value = false;
  }
}

async function cancel(id: string) {
  if (!window.confirm('Parar a transmissão? Quem já recebeu não é afetado.')) return;
  try {
    await apiRequest(`/whatsapp/broadcast/${id}/cancel`, { method: 'POST' });
    await load();
  } catch (e) {
    error.value = errorText(e);
  }
}

const STATUS = { RUNNING: 'Enviando', DONE: 'Concluída', CANCELLED: 'Cancelada' } as const;
const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  load().catch((e) => (error.value = errorText(e)));
  timer = setInterval(() => running.value && load().catch(() => {}), 10_000);
});
onUnmounted(() => {
  clearInterval(timer);
  clearTimeout(previewTimer);
});
</script>

<template>
  <section class="admin-card bc">
    <h2>Lista de transmissão</h2>
    <p class="bc__lead">Uma mensagem para todas as clientes de uma vez — por exemplo, avisar do novo jeito de agendar.</p>

    <div v-if="running" class="bc__running">
      <div class="bc__bar"><span :style="{ width: `${((running.sent + running.failed) / running.total) * 100}%` }" /></div>
      <p>
        <strong>Enviando: {{ running.sent }} de {{ running.total }}</strong>
        <template v-if="running.failed"> · {{ running.failed }} não entregue(s)</template>
        <br /><small>Só envia das 8h às 20h, até 200 por dia, com o WhatsApp conectado.</small>
      </p>
      <button type="button" class="button button--ghost" @click="cancel(running.id)">Parar</button>
    </div>

    <div class="bc__grid">
      <div>
        <fieldset class="bc__sources">
          <legend>Quem recebe</legend>
          <label><input v-model="useContacts" type="checkbox" /> Contatos salvos no celular <span>{{ info?.audience.contacts ?? '…' }}</span></label>
          <label><input v-model="usePatients" type="checkbox" /> Pacientes do sistema <span>{{ info?.audience.patients ?? '…' }}</span></label>
          <p class="bc__total">{{ total }} número(s) sem repetir<template v-if="estimate"> · {{ estimate }}</template></p>
          <button type="button" class="button button--ghost bc__sync" :disabled="syncing || !props.connected" @click="syncContacts">
            {{ syncing ? 'Sincronizando…' : 'Sincronizar contatos do celular' }}
          </button>
        </fieldset>

        <label class="bc__label" for="bc-message">Mensagem</label>
        <textarea id="bc-message" v-model="message" class="bc__text" rows="10" maxlength="4000" />
        <p class="bc__vars"><code>{Saudacao}</code> bom dia/boa tarde · <code>{Cliente}</code> primeiro nome · <code>{LinkAgendamento}</code> link do site</p>
      </div>

      <div class="bc__preview">
        <p class="bc__label">Como chega (exemplo)</p>
        <div class="bc__phone">
          <div class="wa-bubble">
            <p v-for="(line, i) in previewLines" :key="i" class="wa-bubble__line">
              <span
                v-for="(seg, j) in line"
                :key="j"
                :class="{ 'is-bold': seg.bold, 'is-italic': seg.italic, 'is-strike': seg.strike, 'is-link': seg.link }"
              >{{ seg.text }}</span>
            </p>
            <span class="wa-bubble__time">10:30 ✓✓</span>
          </div>
        </div>
      </div>
    </div>

    <p class="bc__warn">
      ⚠️ Envio em massa por conexão não oficial pode levar o WhatsApp a restringir o número. Por isso vai devagar.
      Funciona melhor para quem tem o número da clínica salvo — e a mensagem pede para responder, o que ajuda.
    </p>

    <button
      type="button"
      class="button button--primary"
      :disabled="busy || !!running || !props.connected || !total || message.trim().length < 10"
      @click="start"
    >
      {{ busy ? 'Iniciando…' : `Enviar para ${total} contato(s)` }}
    </button>
    <p v-if="!props.connected" class="bc__hint">Conecte o WhatsApp para enviar.</p>
    <p v-if="feedback" class="bc__ok">{{ feedback }}</p>
    <p v-if="error" class="admin-error">{{ error }}</p>

    <div v-if="info?.broadcasts.length" class="bc__history">
      <p class="bc__label">Últimas transmissões</p>
      <ul>
        <li v-for="b in info.broadcasts" :key="b.id">
          <span :class="`bc__status bc__status--${b.status.toLowerCase()}`">{{ STATUS[b.status] }}</span>
          {{ fmt(b.createdAt) }} · {{ b.sent }}/{{ b.total }} enviadas<template v-if="b.failed"> · {{ b.failed }} falha(s)</template>
          <template v-if="b.createdByName"> · por {{ b.createdByName }}</template>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.bc__lead {
  color: var(--color-ink-muted);
  margin: var(--space-1) 0 var(--space-4);
}

.bc__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--space-5);
}

@media (max-width: 860px) {
  .bc__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.bc__sources {
  border: 0;
  padding: 0;
  margin: 0 0 var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.bc__sources legend,
.bc__label {
  display: block;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-ink-muted);
  margin-bottom: var(--space-2);
}

.bc__sources label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.bc__sources label span {
  margin-left: auto;
  font-weight: 700;
}

.bc__total {
  font-size: 0.85rem;
  color: var(--color-ink-muted);
  margin: 0;
}

.bc__sync {
  align-self: flex-start;
}

.bc__text {
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  font-size: 0.9rem;
  resize: vertical;
}

.bc__vars {
  font-size: 0.78rem;
  color: var(--color-ink-muted);
  margin-top: var(--space-1);
}

.bc__phone {
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: #0b141a;
}

/* mesma bolha da prévia das mensagens automáticas */
.wa-bubble {
  position: relative;
  margin-left: auto;
  max-width: 92%;
  padding: 10px 12px 22px;
  border-radius: 12px 0 12px 12px;
  background: #005c4b;
  color: #e9edef;
  font-size: 0.9rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.wa-bubble__line {
  margin: 0;
  min-height: 1.45em;
}
.wa-bubble__time {
  position: absolute;
  right: 10px;
  bottom: 4px;
  font-size: 0.68rem;
  color: rgba(233, 237, 239, 0.6);
}
.is-bold { font-weight: 700; }
.is-italic { font-style: italic; }
.is-strike { text-decoration: line-through; }
.is-link { color: #53bdeb; }

.bc__warn {
  margin: var(--space-4) 0;
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-gold-500) 14%, transparent);
  color: var(--color-ink);
  font-size: 0.85rem;
}

.bc__running {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.bc__running p {
  margin: 0;
  flex: 1;
  min-width: 200px;
}

.bc__bar {
  flex-basis: 100%;
  height: 8px;
  border-radius: var(--radius-pill);
  background: var(--color-border);
  overflow: hidden;
}

.bc__bar span {
  display: block;
  height: 100%;
  background: var(--color-success);
  transition: width 0.4s ease;
}

.bc__hint,
.bc__ok {
  font-size: 0.85rem;
  margin-top: var(--space-2);
  color: var(--color-ink-muted);
}

.bc__ok {
  color: var(--color-success-ink);
}

.bc__history {
  margin-top: var(--space-5);
}

.bc__history ul {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.bc__status {
  display: inline-block;
  padding: 1px 8px;
  margin-right: var(--space-2);
  border-radius: var(--radius-pill);
  font-size: 0.75rem;
  font-weight: 700;
  background: var(--color-border);
}

.bc__status--running {
  background: var(--color-success-bg);
  color: var(--color-success-ink);
}

.bc__status--cancelled {
  background: var(--color-danger-bg);
  color: var(--color-danger-ink);
}
</style>
