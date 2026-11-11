<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ApiError } from '@/services/api';
import {
  connectWhatsapp,
  disconnectWhatsapp,
  fetchMessageTemplates,
  fetchWhatsappStatus,
  resetMessageTemplate,
  saveMessageTemplate,
  sendWhatsappTest,
} from '@/services/admin-whatsapp.service';
import { MESSAGE_VARIABLES, formatWhatsapp, renderSample } from '@/utils/whatsapp-format';
import type { MessageTemplate, MessageTemplateKey, WhatsappState } from '@/types';
import { Flip, gsap, prefersReducedMotion } from '@/lib/motion';
import LoadingState from '@/components/LoadingState.vue';
import EmptyState from '@/components/EmptyState.vue';

const router = useRouter();

// --- Conexão ---------------------------------------------------------------
const wa = ref<WhatsappState>({ status: 'disconnected', qrDataUrl: null, phone: null });
const connectBusy = ref(false);
const connectError = ref<string | null>(null);
let poll: ReturnType<typeof setInterval> | undefined;

// Enquanto espera a leitura do QR (ou a conexão subir), consulta o status a
// cada 2s — o QR do WhatsApp expira e é renovado sozinho no servidor, e a
// tela precisa mostrar o novo e perceber quando o celular escaneou.
function startPolling() {
  stopPolling();
  poll = setInterval(async () => {
    try {
      wa.value = await fetchWhatsappStatus();
      if (wa.value.status === 'connected' || wa.value.status === 'disconnected') stopPolling();
    } catch {
      stopPolling();
    }
  }, 2000);
}
function stopPolling() {
  if (poll) clearInterval(poll);
  poll = undefined;
}

async function onConnect() {
  connectBusy.value = true;
  connectError.value = null;
  try {
    wa.value = await connectWhatsapp();
    startPolling();
  } catch (err) {
    connectError.value = err instanceof ApiError ? err.message : 'Não foi possível iniciar a conexão.';
  } finally {
    connectBusy.value = false;
  }
}

async function onDisconnect() {
  if (!window.confirm('Desconectar o WhatsApp da clínica? As mensagens automáticas param até conectar de novo.')) return;
  connectBusy.value = true;
  try {
    wa.value = await disconnectWhatsapp();
  } finally {
    connectBusy.value = false;
  }
}

const statusLabel = computed(
  () =>
    ({
      connected: 'Conectado',
      connecting: 'Conectando…',
      qr: 'Aguardando leitura do QR code',
      disconnected: 'Desconectado',
    })[wa.value.status],
);

const formattedPhone = computed(() => {
  const d = wa.value.phone?.replace(/\D/g, '') ?? '';
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : d;
});

// O QR code se abre de cima para baixo ao aparecer (e a cada renovação).
watch(
  () => wa.value.qrDataUrl,
  async (url, previous) => {
    if (!url || prefersReducedMotion()) return;
    await nextTick();
    gsap.fromTo(
      '.wa-connect__qr img',
      { clipPath: previous ? 'inset(0% 0% 0% 0%)' : 'inset(0% 0% 100% 0%)', opacity: previous ? 0.4 : 1 },
      { clipPath: 'inset(0% 0% 0% 0%)', opacity: 1, duration: previous ? 0.4 : 0.8, ease: 'premium-out' },
    );
  },
);

// Conectou: o cartão "acende" — confirmação visível de que a leitura deu certo.
watch(
  () => wa.value.status,
  async (status, previous) => {
    if (status !== 'connected' || previous === 'connected' || prefersReducedMotion()) return;
    await nextTick();
    gsap.fromTo('.wa-connect__check', { scale: 0, rotate: -90 }, { scale: 1, rotate: 0, duration: 0.7, ease: 'back.out(2.2)' });
  },
);

// --- Mensagens -------------------------------------------------------------
// Na ordem em que a paciente recebe as mensagens.
const TEMPLATE_META: Record<MessageTemplateKey, { label: string; when: string }> = {
  WELCOME: {
    label: 'Saudação',
    when: 'Resposta automática quando alguém escreve para a clínica depois de 20 minutos de conversa parada — não interrompe uma conversa em andamento.',
  },
  CONFIRMATION: {
    label: 'Confirmação',
    when: 'Enviada assim que um horário é agendado (pelo site ou pelo painel). Peça para a paciente responder SIM.',
  },
  CONFIRMATION_THANKS: {
    label: 'Resposta ao SIM',
    when: 'Enviada quando a paciente responde "sim" à confirmação. O agendamento fica marcado como confirmado na Agenda.',
  },
  REMINDER_DAY_BEFORE: {
    label: 'Lembrete 1 dia antes',
    when: 'Enviada 24 horas antes do atendimento (nunca entre 21h e 7h — nesse caso, às 7h).',
  },
  REMINDER_2H: { label: 'Lembrete 2h antes', when: 'Enviada 2 horas antes do atendimento.' },
};
const TEMPLATE_ORDER: MessageTemplateKey[] = ['WELCOME', 'CONFIRMATION', 'CONFIRMATION_THANKS', 'REMINDER_DAY_BEFORE', 'REMINDER_2H'];

const templates = ref<MessageTemplate[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const activeKey = ref<MessageTemplateKey>('WELCOME');
const drafts = ref<Record<string, string>>({});
const saving = ref(false);
const saveMessage = ref<string | null>(null);
const saveError = ref<string | null>(null);

const active = computed(() => templates.value.find((t) => t.key === activeKey.value) ?? null);
const draft = computed({
  get: () => drafts.value[activeKey.value] ?? active.value?.body ?? '',
  set: (value: string) => {
    drafts.value = { ...drafts.value, [activeKey.value]: value };
  },
});
const dirty = computed(() => !!active.value && draft.value !== active.value.body);
const preview = computed(() => formatWhatsapp(renderSample(draft.value)));

function applyTemplates(list: MessageTemplate[]) {
  templates.value = TEMPLATE_ORDER.map((k) => list.find((t) => t.key === k)!).filter(Boolean);
}

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const [status, { templates: list }] = await Promise.all([fetchWhatsappStatus(), fetchMessageTemplates()]);
    wa.value = status;
    applyTemplates(list);
    if (status.status === 'qr' || status.status === 'connecting') startPolling();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      router.push({ name: 'admin-login' });
      return;
    }
    loadError.value = err instanceof ApiError ? err.message : 'Não foi possível carregar o WhatsApp.';
  } finally {
    loading.value = false;
  }
}

async function onSave() {
  if (!active.value) return;
  saving.value = true;
  saveError.value = null;
  try {
    const { templates: list } = await saveMessageTemplate(active.value.key, { body: draft.value });
    applyTemplates(list);
    const { [activeKey.value]: _, ...rest } = drafts.value;
    drafts.value = rest;
    flashSaved('Mensagem salva.');
  } catch (err) {
    saveError.value = err instanceof ApiError ? err.message : 'Não foi possível salvar.';
  } finally {
    saving.value = false;
  }
}

async function onReset() {
  if (!active.value || !window.confirm('Voltar esta mensagem para o texto padrão? O texto atual será substituído.')) return;
  saving.value = true;
  try {
    const { templates: list } = await resetMessageTemplate(active.value.key);
    applyTemplates(list);
    const { [activeKey.value]: _, ...rest } = drafts.value;
    drafts.value = rest;
    flashSaved('Texto padrão restaurado.');
  } finally {
    saving.value = false;
  }
}

async function onToggle(template: MessageTemplate) {
  const enabled = !template.enabled;
  template.enabled = enabled;
  try {
    const { templates: list } = await saveMessageTemplate(template.key, { enabled });
    applyTemplates(list);
  } catch {
    template.enabled = !enabled;
  }
}

function flashSaved(text: string) {
  saveMessage.value = text;
  setTimeout(() => {
    if (saveMessage.value === text) saveMessage.value = null;
  }, 2600);
}

// Editor: os botões de formatação envolvem a seleção com o marcador do
// WhatsApp, e os chips de variável entram exatamente na posição do cursor.
const textarea = ref<HTMLTextAreaElement | null>(null);

async function replaceSelection(build: (selected: string) => string, cursorOffset?: (built: string) => number) {
  const el = textarea.value;
  if (!el) return;
  const { selectionStart: start, selectionEnd: end, value } = el;
  const built = build(value.slice(start, end));
  draft.value = value.slice(0, start) + built + value.slice(end);
  await nextTick();
  el.focus();
  const caret = start + (cursorOffset ? cursorOffset(built) : built.length);
  el.setSelectionRange(caret, caret);
}

function wrap(marker: '*' | '_' | '~') {
  replaceSelection(
    (selected) => `${marker}${selected || 'texto'}${marker}`,
    (built) => built.length,
  );
}

function insertVariable(name: string) {
  replaceSelection(() => `{${name}}`);
}

// Abas: pílula deslizante (Flip) e o balão de prévia "chega" como uma
// mensagem nova ao trocar de modelo.
const tabsEl = ref<HTMLElement | null>(null);
const tabPill = ref<HTMLElement | null>(null);
function syncTabPill(animate: boolean) {
  const nav = tabsEl.value;
  const pill = tabPill.value;
  const btn = nav?.querySelector<HTMLElement>('button.is-active');
  if (!nav || !pill || !btn) return;
  const state = Flip.getState(pill);
  pill.style.width = `${btn.offsetWidth}px`;
  pill.style.height = `${btn.offsetHeight}px`;
  pill.style.transform = `translate(${btn.offsetLeft}px, ${btn.offsetTop}px)`;
  if (animate && !prefersReducedMotion()) Flip.from(state, { duration: 0.5, ease: 'premium-out' });
}

watch(activeKey, async () => {
  await nextTick();
  syncTabPill(true);
  if (prefersReducedMotion()) return;
  gsap.fromTo('.wa-bubble', { y: 24, scale: 0.94, transformOrigin: '100% 100%' }, { y: 0, scale: 1, duration: 0.55, ease: 'back.out(1.6)', clearProps: 'transform' });
});

watch(loading, async (isLoading) => {
  if (isLoading) return;
  await nextTick();
  syncTabPill(false);
});

// --- Teste ----------------------------------------------------------------
const testPhone = ref('');
const testBusy = ref(false);
const testMessage = ref<string | null>(null);
const testError = ref<string | null>(null);

async function onSendTest() {
  testBusy.value = true;
  testError.value = null;
  testMessage.value = null;
  try {
    await sendWhatsappTest(testPhone.value.replace(/\D/g, ''), renderSample(draft.value));
    testMessage.value = 'Mensagem de teste enviada.';
  } catch (err) {
    testError.value = err instanceof ApiError ? err.message : 'Não foi possível enviar o teste.';
  } finally {
    testBusy.value = false;
  }
}

onMounted(load);
onUnmounted(stopPolling);
</script>

<template>
  <div class="admin-wa">
    <div class="admin-wa__header">
      <div>
        <h1>WhatsApp</h1>
        <p>Conexão do WhatsApp da clínica e as mensagens enviadas automaticamente às pacientes.</p>
      </div>
    </div>

    <Transition name="fade-swap">
      <LoadingState v-if="loading" key="loading" label="Carregando WhatsApp…" />
      <EmptyState v-else-if="loadError" key="error" title="Algo deu errado" :description="loadError" action-label="Tentar novamente" @action="load" />

      <div v-else key="content" v-stagger class="admin-wa__content">
        <!-- Conexão -->
        <section class="admin-card wa-connect" :class="`wa-connect--${wa.status}`">
          <div class="wa-connect__head">
            <span class="wa-connect__status">
              <span class="wa-connect__dot" aria-hidden="true" />
              {{ statusLabel }}
            </span>
            <span v-if="wa.status === 'connected' && formattedPhone" class="wa-connect__phone">{{ formattedPhone }}</span>
          </div>

          <div v-if="wa.status === 'connected'" class="wa-connect__body">
            <span class="wa-connect__check" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
            </span>
            <div>
              <h2>WhatsApp conectado</h2>
              <p>As mensagens ligadas abaixo saem automaticamente deste número.</p>
            </div>
            <button type="button" class="button button--ghost wa-connect__action" :disabled="connectBusy" @click="onDisconnect">Desconectar</button>
          </div>

          <div v-else-if="wa.status === 'qr' && wa.qrDataUrl" class="wa-connect__body wa-connect__body--qr">
            <div class="wa-connect__qr"><img :src="wa.qrDataUrl" alt="QR code para conectar o WhatsApp" /></div>
            <ol class="wa-connect__steps">
              <li>Abra o WhatsApp no celular da clínica.</li>
              <li>Toque em <strong>Mais opções</strong> (ou <strong>Configurações</strong>) e depois em <strong>Aparelhos conectados</strong>.</li>
              <li>Toque em <strong>Conectar um aparelho</strong> e aponte a câmera para este código.</li>
            </ol>
          </div>

          <div v-else class="wa-connect__body">
            <div>
              <h2>{{ wa.status === 'connecting' ? 'Preparando a conexão…' : 'Conecte o WhatsApp da clínica' }}</h2>
              <p>Vincule o número da clínica como um aparelho conectado (o mesmo jeito do WhatsApp Web). Basta fazer uma vez — a conexão continua mesmo depois que o painel é fechado.</p>
            </div>
            <button
              v-if="wa.status === 'disconnected'"
              type="button"
              class="button button--primary wa-connect__action"
              :disabled="connectBusy"
              @click="onConnect"
            >
              {{ connectBusy ? 'Gerando QR code…' : 'Conectar WhatsApp' }}
            </button>
          </div>
          <p v-if="connectError" class="admin-error">{{ connectError }}</p>

          <p class="wa-connect__note">
            Conexão não oficial, pelo mesmo método do WhatsApp Web — sem custo por mensagem, mas o WhatsApp pode
            restringir números que enviam muitas mensagens automáticas. O sistema espaça os envios e só manda as
            mensagens abaixo.
          </p>
        </section>

        <!-- Mensagens -->
        <section class="admin-card wa-messages">
          <div class="wa-messages__top">
            <h2>Mensagens automáticas</h2>
            <nav ref="tabsEl" class="wa-tabs" aria-label="Modelos de mensagem">
              <span ref="tabPill" class="wa-tabs__pill" aria-hidden="true" />
              <button
                v-for="t in templates"
                :key="t.key"
                type="button"
                :class="{ 'is-active': activeKey === t.key }"
                @click="activeKey = t.key"
              >
                {{ TEMPLATE_META[t.key].label }}
                <span class="wa-tabs__state" :class="{ 'is-off': !t.enabled }" :aria-label="t.enabled ? 'ligada' : 'desligada'" />
              </button>
            </nav>
          </div>

          <div v-if="active" class="wa-messages__grid">
            <div class="wa-editor">
              <div class="wa-editor__when">
                <p>{{ TEMPLATE_META[active.key].when }}</p>
                <label class="wa-switch">
                  <input type="checkbox" :checked="active.enabled" @change="onToggle(active)" />
                  <span class="wa-switch__track" aria-hidden="true"><span class="wa-switch__thumb" /></span>
                  {{ active.enabled ? 'Envio automático ligado' : 'Envio automático desligado' }}
                </label>
              </div>

              <div class="wa-editor__box">
                <div class="wa-editor__toolbar" role="toolbar" aria-label="Formatação">
                  <button type="button" class="wa-tool" aria-label="Negrito" @click="wrap('*')"><strong>B</strong></button>
                  <button type="button" class="wa-tool" aria-label="Itálico" @click="wrap('_')"><em>I</em></button>
                  <button type="button" class="wa-tool" aria-label="Riscado" @click="wrap('~')"><s>S</s></button>
                  <span class="wa-editor__count">{{ draft.length }}/4000</span>
                </div>
                <textarea
                  ref="textarea"
                  v-model="draft"
                  class="wa-editor__input"
                  rows="14"
                  maxlength="4000"
                  spellcheck="true"
                  aria-label="Texto da mensagem"
                />
                <div class="wa-editor__vars">
                  <span>Inserir:</span>
                  <button v-for="v in MESSAGE_VARIABLES" :key="v.name" type="button" class="wa-chip" @click="insertVariable(v.name)">
                    {{ v.label }}
                  </button>
                </div>
              </div>

              <div class="wa-editor__actions">
                <button type="button" class="button button--primary" :disabled="!dirty || saving" @click="onSave">
                  {{ saving ? 'Salvando…' : 'Salvar' }}
                </button>
                <button v-if="!active.isDefault || dirty" type="button" class="admin-link-btn" :disabled="saving" @click="onReset">
                  Restaurar texto padrão
                </button>
                <Transition name="fade-swap">
                  <span v-if="saveMessage" class="wa-editor__saved">{{ saveMessage }}</span>
                </Transition>
              </div>
              <p v-if="saveError" class="admin-error">{{ saveError }}</p>
            </div>

            <div class="wa-preview" aria-label="Prévia da mensagem">
              <span class="wa-preview__label">Como a paciente vai ver</span>
              <div class="wa-preview__screen">
                <div class="wa-bubble">
                  <p v-for="(line, i) in preview" :key="i" class="wa-bubble__line">
                    <template v-for="(seg, j) in line" :key="j">
                      <span
                        :class="{ 'is-bold': seg.bold, 'is-italic': seg.italic, 'is-strike': seg.strike, 'is-link': seg.link }"
                      >{{ seg.text }}</span>
                    </template>
                    <br v-if="!line.length" />
                  </p>
                  <span class="wa-bubble__time">10:30 ✓✓</span>
                </div>
              </div>

              <form class="wa-test" @submit.prevent="onSendTest">
                <label class="admin-field">
                  Enviar um teste para
                  <input v-model="testPhone" type="tel" inputmode="numeric" placeholder="71999998888" required />
                </label>
                <button type="submit" class="button button--ghost" :disabled="testBusy || wa.status !== 'connected'">
                  {{ testBusy ? 'Enviando…' : 'Enviar teste' }}
                </button>
              </form>
              <p v-if="wa.status !== 'connected'" class="wa-test__hint">Conecte o WhatsApp para enviar um teste.</p>
              <p v-if="testMessage" class="wa-test__ok">{{ testMessage }}</p>
              <p v-if="testError" class="admin-error">{{ testError }}</p>
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.admin-wa__header {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.admin-wa__header p {
  color: var(--color-ink-muted);
}

.admin-wa__content {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.admin-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-5);
  box-shadow: var(--shadow-sm);
}

.admin-card h2 {
  font-size: 1.1rem;
}

.admin-error {
  color: var(--color-danger);
  font-size: 0.85rem;
  margin-top: var(--space-2);
}

/* --- Conexão --- */
.wa-connect {
  --wa-state: var(--color-ink-soft);
  position: relative;
  overflow: hidden;
}

.wa-connect--connected {
  --wa-state: var(--color-success);
  border-color: color-mix(in srgb, var(--color-success) 35%, var(--color-border));
}

.wa-connect--qr,
.wa-connect--connecting {
  --wa-state: var(--color-gold-500);
}

.wa-connect__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.wa-connect__status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--wa-state);
}

.wa-connect__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--wa-state);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--wa-state) 18%, transparent);
}

.wa-connect--qr .wa-connect__dot,
.wa-connect--connecting .wa-connect__dot {
  animation: wa-pulse 1.4s ease-in-out infinite;
}

@keyframes wa-pulse {
  50% {
    box-shadow: 0 0 0 7px color-mix(in srgb, var(--wa-state) 0%, transparent);
  }
}

.wa-connect__phone {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--color-ink);
}

.wa-connect__body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4);
}

.wa-connect__body > div {
  flex: 1 1 280px;
}

.wa-connect__body p {
  color: var(--color-ink-muted);
  font-size: 0.92rem;
  margin-top: 4px;
  max-width: 62ch;
}

.wa-connect__action {
  flex-shrink: 0;
}

.wa-connect__check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--color-success) 14%, var(--color-surface));
  color: var(--color-success);
  flex-shrink: 0;
}

.wa-connect__body--qr {
  align-items: flex-start;
  gap: var(--space-6);
}

.wa-connect__qr {
  flex-shrink: 0;
  padding: 12px;
  border-radius: var(--radius-md);
  background: #fff;
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-md);
}

.wa-connect__qr img {
  width: 232px;
  height: 232px;
  image-rendering: pixelated;
}

.wa-connect__steps {
  flex: 1 1 260px;
  margin: 0;
  padding-left: 1.2em;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  color: var(--color-ink);
  font-size: 0.95rem;
}

.wa-connect__note {
  margin-top: var(--space-5);
  padding-top: var(--space-4);
  border-top: 1px dashed var(--color-border);
  font-size: 0.8rem;
  color: var(--color-ink-soft);
  max-width: 90ch;
}

/* --- Mensagens --- */
.wa-messages__top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-5);
}

.wa-tabs {
  position: relative;
  display: inline-flex;
  max-width: 100%;
  gap: 2px;
  padding: 4px;
  border-radius: 24px;
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  /* Quebra em linhas no celular em vez de esconder abas cortadas à direita. */
  flex-wrap: wrap;
}

.wa-tabs__pill {
  position: absolute;
  top: 0;
  left: 0;
  border-radius: var(--radius-pill);
  background: var(--color-rose-900);
  box-shadow: var(--shadow-sm);
  pointer-events: none;
}

.wa-tabs button {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border: none;
  border-radius: var(--radius-pill);
  background: none;
  font-weight: 600;
  font-size: 0.88rem;
  color: var(--color-ink-muted);
  cursor: pointer;
  white-space: nowrap;
  transition: color var(--duration-base) var(--ease-premium);
}

.wa-tabs button.is-active {
  color: #fff;
}

/* Bolinha de estado de cada modelo na própria aba: verde = envio ligado. */
.wa-tabs__state {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #25d366;
}

.wa-tabs__state.is-off {
  background: var(--color-ink-soft);
}

.wa-messages__grid {
  display: grid;
  gap: var(--space-6);
}

@media (min-width: 980px) {
  .wa-messages__grid {
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
    align-items: start;
  }
}

.wa-editor__when {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.wa-editor__when p {
  font-size: 0.88rem;
  color: var(--color-ink-muted);
  flex: 1 1 260px;
}

/* Interruptor (checkbox de verdade por baixo — teclado e leitor de tela
   continuam funcionando). */
.wa-switch {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-ink);
  cursor: pointer;
}

.wa-switch input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}

.wa-switch__track {
  position: relative;
  width: 42px;
  height: 24px;
  border-radius: var(--radius-pill);
  background: var(--color-border);
  transition: background var(--duration-base) var(--ease-premium);
}

.wa-switch__thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: var(--shadow-sm);
  transition: transform var(--duration-base) cubic-bezier(0.34, 1.56, 0.64, 1);
}

.wa-switch input:checked + .wa-switch__track {
  background: var(--color-success);
}

.wa-switch input:checked + .wa-switch__track .wa-switch__thumb {
  transform: translateX(18px);
}

.wa-switch input:focus-visible + .wa-switch__track {
  outline: 2px solid var(--color-rose-700);
  outline-offset: 3px;
}

.wa-editor__box {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  overflow: hidden;
  transition: border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard);
}

.wa-editor__box:focus-within {
  border-color: var(--color-rose-700);
  box-shadow: 0 0 0 3px var(--color-rose-100);
}

.wa-editor__toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}

.wa-tool {
  width: 34px;
  height: 34px;
  min-height: 34px;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  font-size: 1rem;
  color: var(--color-ink);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-standard);
}

.wa-tool:hover {
  background: var(--color-rose-100);
}

.wa-editor__count {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--color-ink-soft);
  font-variant-numeric: tabular-nums;
}

.wa-editor__input {
  display: block;
  width: 100%;
  border: none;
  outline: none;
  resize: vertical;
  padding: var(--space-4);
  background: transparent;
  font-family: inherit;
  font-size: 0.95rem;
  line-height: 1.6;
  color: var(--color-ink);
}

.wa-editor__vars {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
}

.wa-editor__vars > span {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--color-ink-muted);
  margin-right: 4px;
}

.wa-chip {
  min-height: 30px;
  padding: 4px 12px;
  border: 1px solid var(--color-rose-300);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-rose-700);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard);
}

.wa-chip:hover {
  background: var(--color-rose-100);
  transform: translateY(-1px);
}

.wa-editor__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4);
  margin-top: var(--space-4);
}

.wa-editor__saved {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-success);
}

.admin-link-btn {
  background: none;
  border: none;
  padding: 0;
  min-height: auto;
  font-weight: 600;
  font-size: 0.88rem;
  color: var(--color-rose-700);
  cursor: pointer;
}

/* --- Prévia: tela do WhatsApp (fundo de conversa escuro + balão verde do
   próprio app), para a clínica ver exatamente como a mensagem chega. --- */
.wa-preview__label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-ink-muted);
  margin-bottom: var(--space-2);
}

.wa-preview__screen {
  padding: var(--space-5) var(--space-4);
  border-radius: var(--radius-md);
  background-color: #0b141a;
  background-image: radial-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px);
  background-size: 14px 14px;
  max-height: 560px;
  overflow-y: auto;
}

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
  box-shadow: 0 1px 0.5px rgba(0, 0, 0, 0.3);
  overflow-wrap: anywhere;
}

.wa-bubble::before {
  content: '';
  position: absolute;
  top: 0;
  right: -8px;
  border-top: 10px solid #005c4b;
  border-right: 8px solid transparent;
}

.wa-bubble__line {
  margin: 0;
  min-height: 1.45em;
}

.is-bold {
  font-weight: 700;
}

.is-italic {
  font-style: italic;
}

.is-strike {
  text-decoration: line-through;
}

.is-link {
  color: #53bdeb;
}

.wa-bubble__time {
  position: absolute;
  right: 10px;
  bottom: 4px;
  font-size: 0.68rem;
  color: rgba(233, 237, 239, 0.6);
}

.wa-test {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.wa-test .admin-field {
  flex: 1 1 180px;
}

.wa-test__hint,
.wa-test__ok {
  margin-top: var(--space-2);
  font-size: 0.82rem;
  color: var(--color-ink-soft);
}

.wa-test__ok {
  color: var(--color-success);
  font-weight: 600;
}
</style>
