<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { apiRequest, ApiError } from '@/services/api';
import { SITE_SECTIONS, SITE_DEFAULTS, type SiteSection } from '@/data/site-content';
import { useSiteContentStore } from '@/stores/siteContent';
import { useAuthStore } from '@/stores/auth';
import { fetchPublicSettings } from '@/services/settings.service';
import { assetUrl } from '@/utils/images';
import ImageUploadButton from '@/components/admin/ImageUploadButton.vue';
import LoadingState from '@/components/LoadingState.vue';

// Painel → Site: a clínica edita textos, fotos, seções e contato do site
// público, vendo ao lado como o site fica ANTES (publicado) e DEPOIS (com as
// mudanças ainda não salvas). A pré-visualização é o próprio site num iframe
// (?preview=1), que recebe o rascunho por postMessage (utils/sitePreview.ts).
const site = useSiteContentStore();
const auth = useAuthStore();
const isAdmin = computed(() => auth.user?.role === 'ADMIN');
const loading = ref(true);
const values = reactive<Record<string, string>>({});
const original = ref<Record<string, string>>({});

// Contato (WhatsApp, Instagram...) mora nas configurações da clínica, não nos
// textos do site — salva por outro caminho, mas aparece aqui junto.
const CONTACT_FIELDS = [
  { key: 'whatsapp', label: 'WhatsApp', hint: 'Com DDI e DDD, ex.: 55 71 99289-4874. Usado em todos os botões de WhatsApp do site.' },
  { key: 'instagram', label: 'Instagram', hint: 'Com ou sem @, ex.: @noelycerqueira.' },
  { key: 'email', label: 'E-mail', hint: 'Aparece no rodapé e na página Contato.' },
  { key: 'address', label: 'Endereço', hint: 'Rua, número, bairro, cidade e CEP.' },
  { key: 'addressMapUrl', label: 'Link do mapa (opcional)', hint: 'Link do Google Maps (começa com https://). Em branco: o site monta o link pelo endereço.' },
] as const;
type ContactKey = (typeof CONTACT_FIELDS)[number]['key'];
const contact = reactive<Record<ContactKey, string>>({ whatsapp: '', instagram: '', email: '', address: '', addressMapUrl: '' });
const contactOriginal = ref<Record<ContactKey, string>>({ ...contact });

const CONTACT_SECTION: SiteSection = {
  id: 'contact-info',
  title: 'Contato e endereço',
  description: 'WhatsApp, Instagram, e-mail e endereço que aparecem no rodapé de todas as páginas, na página Contato e nos botões de WhatsApp.',
  page: '/contato',
  fields: [],
};

const groups = computed(() => [
  { label: 'Página inicial', sections: SITE_SECTIONS.filter((s) => s.page === '/') },
  { label: 'Outras páginas', sections: SITE_SECTIONS.filter((s) => s.page !== '/' && s.page !== '/tv') },
  { label: 'Geral', sections: [CONTACT_SECTION, ...SITE_SECTIONS.filter((s) => s.page === '/tv')] },
]);
const activeId = ref(SITE_SECTIONS[0].id);
const active = computed(() => (activeId.value === CONTACT_SECTION.id ? CONTACT_SECTION : SITE_SECTIONS.find((s) => s.id === activeId.value)!));

onMounted(async () => {
  await site.load(true);
  for (const key of Object.keys(SITE_DEFAULTS)) values[key] = site.get(key);
  original.value = { ...values };
  try {
    const s = await fetchPublicSettings();
    for (const f of CONTACT_FIELDS) contact[f.key] = s[f.key] ?? '';
  } catch {
    // sem contato: os campos ficam vazios e não são salvos sem mudança
  }
  contactOriginal.value = { ...contact };
  loading.value = false;
  window.addEventListener('message', onFrameMessage);
});
onUnmounted(() => window.removeEventListener('message', onFrameMessage));

const changedKeys = computed(() => Object.keys(values).filter((k) => values[k] !== original.value[k]));
const contactChanged = computed(() => CONTACT_FIELDS.some((f) => contact[f.key] !== contactOriginal.value[f.key]));
const changeCount = computed(() => changedKeys.value.length + (contactChanged.value ? 1 : 0));
const sectionChanged = (s: SiteSection) =>
  s.id === CONTACT_SECTION.id ? contactChanged.value : s.fields.some((f) => values[f.key] !== original.value[f.key]);

// --- Pré-visualização -------------------------------------------------------
const mode = ref<'antes' | 'depois'>('depois');
const device = ref<'computador' | 'celular'>('computador');
const frame = ref<HTMLIFrameElement | null>(null);
const frameBox = ref<HTMLElement | null>(null);
const frameSrc = ref(`${SITE_SECTIONS[0].page}?preview=1`);
const boxSize = reactive({ w: 0, h: 0 });
const deviceWidth = computed(() => (device.value === 'computador' ? 1280 : 390));
const scale = computed(() => (boxSize.w ? Math.min(1, boxSize.w / deviceWidth.value) : 1));

let resizeObserver: ResizeObserver | undefined;
watch(frameBox, (el) => {
  resizeObserver?.disconnect();
  if (!el) return;
  resizeObserver = new ResizeObserver(([entry]) => {
    boxSize.w = entry.contentRect.width;
    boxSize.h = entry.contentRect.height;
  });
  resizeObserver.observe(el);
});
onUnmounted(() => resizeObserver?.disconnect());

function post(message: unknown) {
  frame.value?.contentWindow?.postMessage(message, window.location.origin);
}
function sendDraft() {
  if (mode.value === 'antes') {
    post({ type: 'site-preview', content: null, contact: null });
    return;
  }
  const digits = contact.whatsapp.replace(/\D/g, '');
  const ig = contact.instagram.trim();
  post({
    type: 'site-preview',
    content: { ...values },
    contact: contactChanged.value
      ? { ...contact, whatsapp: digits, instagram: ig && !ig.startsWith('@') ? `@${ig}` : ig, addressMapUrl: contact.addressMapUrl.trim() || null }
      : null,
  });
}
function scrollPreview() {
  if (active.value.anchor) post({ type: 'site-preview-scroll', selector: active.value.anchor });
}
function onFrameMessage(event: MessageEvent) {
  if (event.origin !== window.location.origin || event.source !== frame.value?.contentWindow) return;
  if (event.data?.type === 'site-preview-ready') {
    sendDraft();
    // O site monta as seções depois de carregar o catálogo: espera um pouco.
    setTimeout(scrollPreview, 900);
  }
}

let draftTimer: ReturnType<typeof setTimeout> | undefined;
watch([values, contact, mode], () => {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(sendDraft, 150);
});

function selectSection(id: string) {
  activeId.value = id;
  const page = active.value.page;
  if (!frameSrc.value.startsWith(`${page}?`)) frameSrc.value = `${page}?preview=1`;
  else nextTick(scrollPreview);
}

// --- Salvar -----------------------------------------------------------------
const saving = ref(false);
const message = ref<{ ok: boolean; text: string } | null>(null);

async function save() {
  if (!changeCount.value) return;
  saving.value = true;
  message.value = null;
  try {
    if (changedKeys.value.length) {
      const content: Record<string, string | null> = {};
      for (const key of changedKeys.value) {
        const value = values[key].trim();
        // Vazio ou igual ao padrão: guarda como "padrão" (segue o site se o texto padrão mudar).
        content[key] = !value || value === SITE_DEFAULTS[key] ? null : value;
      }
      const res = await apiRequest<{ content: Record<string, string> }>('/site-content', { method: 'PUT', body: JSON.stringify({ content }) });
      site.saved = res.content;
      for (const key of Object.keys(SITE_DEFAULTS)) values[key] = site.get(key);
      original.value = { ...values };
    }
    if (contactChanged.value) {
      const res = await apiRequest<Record<ContactKey, string | null>>('/settings/contact', { method: 'PUT', body: JSON.stringify(contact) });
      for (const f of CONTACT_FIELDS) contact[f.key] = res[f.key] ?? '';
      contactOriginal.value = { ...contact };
    }
    message.value = { ok: true, text: 'Salvo! O site já mostra as mudanças para as clientes.' };
  } catch (err) {
    message.value = { ok: false, text: err instanceof ApiError ? err.message : 'Não foi possível salvar. Tente de novo.' };
  } finally {
    saving.value = false;
  }
}

function discard() {
  Object.assign(values, original.value);
  Object.assign(contact, contactOriginal.value);
  message.value = null;
}

function resetField(key: string) {
  values[key] = SITE_DEFAULTS[key];
}
</script>

<template>
  <div class="admin-site">
    <div class="admin-site__header">
      <div>
        <h1>Site</h1>
        <p>Mude textos, fotos, seções e contato do site e veja ao lado como fica antes de publicar.</p>
      </div>
      <div class="admin-site__actions">
        <a href="/" target="_blank" rel="noopener" class="button button--ghost">Abrir o site ↗</a>
        <button v-if="changeCount" type="button" class="button button--ghost" :disabled="saving" @click="discard">Descartar</button>
        <button type="button" class="button button--primary" :disabled="saving || !changeCount" @click="save">
          {{ saving ? 'Salvando…' : changeCount ? `Salvar e publicar (${changeCount})` : 'Tudo salvo' }}
        </button>
      </div>
    </div>

    <ol class="admin-site__guide">
      <li><strong>Escolha a parte do site</strong> nos botões abaixo.</li>
      <li><strong>Edite</strong> e veja na janela ao lado: <em>Depois</em> é com as suas mudanças, <em>Antes</em> é o que está no ar.</li>
      <li><strong>Salvar e publicar</strong> coloca no ar na hora. Nada muda para as clientes antes disso.</li>
    </ol>

    <p v-if="message" class="admin-site__message" :class="{ 'admin-site__message--error': !message.ok }" role="status">{{ message.text }}</p>

    <LoadingState v-if="loading" label="Carregando o site…" />

    <div v-else class="admin-site__layout">
      <div class="admin-site__editor">
        <nav class="admin-site__nav" aria-label="Partes do site">
          <div v-for="group in groups" :key="group.label" class="admin-site__nav-group">
            <span class="admin-site__nav-label">{{ group.label }}</span>
            <div class="admin-site__chips">
              <button
                v-for="s in group.sections"
                :key="s.id"
                type="button"
                class="admin-site__chip"
                :class="{ 'is-active': s.id === activeId }"
                :aria-pressed="s.id === activeId"
                @click="selectSection(s.id)"
              >
                {{ s.title.replace(/^Início — /, '') }}
                <span v-if="sectionChanged(s)" class="admin-site__dot" title="Tem mudança não salva" />
              </button>
            </div>
          </div>
        </nav>

        <section class="admin-card admin-site__section">
          <h2>{{ active.title }}</h2>
          <p class="admin-site__where">{{ active.description }}</p>

          <!-- Contato e endereço (configurações da clínica) -->
          <template v-if="active.id === 'contact-info'">
            <p v-if="!isAdmin" class="admin-site__note">Só a administração pode mudar o contato e o endereço.</p>
            <label v-for="f in CONTACT_FIELDS" :key="f.key" class="admin-field admin-site__field">
              <span class="admin-site__label-row">
                {{ f.label }}
                <span v-if="contact[f.key] !== contactOriginal[f.key]" class="admin-site__changed">alterado</span>
              </span>
              <input v-model="contact[f.key]" type="text" maxlength="500" :disabled="!isAdmin" />
              <small class="admin-site__hint">{{ f.hint }}</small>
            </label>
          </template>

          <template v-else>
            <div
              v-for="field in active.fields"
              :key="field.key"
              class="admin-site__field"
              :class="{ 'admin-site__field--image': field.kind === 'image' }"
            >
              <template v-if="field.kind === 'image'">
                <img class="admin-site__preview" :src="assetUrl(values[field.key])" :alt="field.label" loading="lazy" decoding="async" />
                <div class="admin-site__image-info">
                  <span class="admin-site__label-row">
                    {{ field.label }}
                    <span v-if="values[field.key] !== original[field.key]" class="admin-site__changed">alterado</span>
                  </span>
                  <small v-if="field.hint" class="admin-site__hint">{{ field.hint }}</small>
                  <div class="admin-site__image-actions">
                    <ImageUploadButton @uploaded="(url) => (values[field.key] = url)" />
                    <button v-if="values[field.key] !== field.default" type="button" class="admin-site__reset" @click="resetField(field.key)">
                      Voltar à foto original
                    </button>
                  </div>
                </div>
              </template>

              <label v-else-if="field.kind === 'toggle'" class="admin-site__toggle">
                <input
                  type="checkbox"
                  :checked="values[field.key] !== 'não'"
                  @change="values[field.key] = ($event.target as HTMLInputElement).checked ? 'sim' : 'não'"
                />
                <span class="admin-site__switch" aria-hidden="true"><span /></span>
                <span>
                  {{ field.label }}
                  <small class="admin-site__hint">{{ values[field.key] !== 'não' ? 'Aparece no site.' : 'Escondida: as clientes não veem esta parte.' }}</small>
                </span>
                <span v-if="values[field.key] !== original[field.key]" class="admin-site__changed">alterado</span>
              </label>

              <label v-else class="admin-field">
                <span class="admin-site__label-row">
                  {{ field.label }}
                  <span v-if="values[field.key] !== original[field.key]" class="admin-site__changed">alterado</span>
                  <button v-if="values[field.key] !== field.default" type="button" class="admin-site__reset" @click.prevent="resetField(field.key)">
                    Voltar ao padrão
                  </button>
                </span>
                <textarea v-if="field.kind === 'textarea'" v-model="values[field.key]" rows="3" maxlength="600" @focus="scrollPreview" />
                <input v-else v-model="values[field.key]" type="text" maxlength="600" @focus="scrollPreview" />
                <small v-if="field.hint" class="admin-site__hint">{{ field.hint }}</small>
              </label>
            </div>
          </template>
        </section>
      </div>

      <aside class="admin-card admin-site__preview-panel" aria-label="Pré-visualização do site">
        <div class="admin-site__toolbar">
          <div class="admin-site__segmented" role="group" aria-label="Comparar">
            <button type="button" :class="{ 'is-active': mode === 'antes' }" @click="mode = 'antes'">Antes</button>
            <button type="button" :class="{ 'is-active': mode === 'depois' }" @click="mode = 'depois'">
              Depois<span v-if="changeCount" class="admin-site__dot" />
            </button>
          </div>
          <div class="admin-site__segmented" role="group" aria-label="Tela">
            <button type="button" :class="{ 'is-active': device === 'computador' }" @click="device = 'computador'">Computador</button>
            <button type="button" :class="{ 'is-active': device === 'celular' }" @click="device = 'celular'">Celular</button>
          </div>
        </div>
        <p class="admin-site__mode-hint">
          <template v-if="mode === 'antes'">Antes: como o site está no ar agora.</template>
          <template v-else-if="changeCount">Depois: como vai ficar com as suas mudanças (ainda não publicadas).</template>
          <template v-else>Sem mudanças: Antes e Depois estão iguais.</template>
        </p>
        <div ref="frameBox" class="admin-site__frame-box">
          <div
            class="admin-site__frame-scale"
            :style="{ width: `${deviceWidth * scale}px`, height: `${boxSize.h}px` }"
          >
            <iframe
              ref="frame"
              :src="frameSrc"
              title="Pré-visualização do site"
              :style="{ width: `${deviceWidth}px`, height: `${boxSize.h / scale}px`, transform: `scale(${scale})` }"
            />
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.admin-site__header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.admin-site__header p {
  color: var(--color-ink-muted);
}

.admin-site__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.admin-site__guide {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  gap: var(--space-3);
  margin: 0 0 var(--space-5);
  padding: 0;
  list-style: none;
  counter-reset: guide;
}

.admin-site__guide li {
  counter-increment: guide;
  position: relative;
  padding: var(--space-3) var(--space-4) var(--space-3) 48px;
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
  font-size: 0.88rem;
  color: var(--color-ink-muted);
}

.admin-site__guide li::before {
  content: counter(guide);
  position: absolute;
  left: 14px;
  top: 12px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--color-fill-700);
  color: #fff;
  font-weight: 700;
  font-size: 0.8rem;
}

.admin-site__guide strong {
  color: var(--color-ink);
}

.admin-site__message {
  margin: 0 0 var(--space-4);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  background: var(--color-success-bg);
  color: var(--color-success-ink);
  font-weight: 600;
}

.admin-site__message--error {
  background: var(--color-danger-bg);
  color: var(--color-danger-ink);
}

.admin-site__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-5);
  align-items: start;
}

@media (min-width: 1200px) {
  .admin-site__layout {
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  }

  .admin-site__preview-panel {
    position: sticky;
    /* abaixo do sino e do botão de tema, que ficam fixos no canto */
    top: 76px;
  }
}

.admin-site__nav {
  display: grid;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.admin-site__nav-label {
  display: block;
  margin-bottom: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-ink-soft);
}

.admin-site__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.admin-site__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}

.admin-site__chip:hover {
  border-color: var(--color-fill-700);
}

.admin-site__chip.is-active {
  border-color: transparent;
  background: var(--color-fill-700);
  color: #fff;
}

.admin-site__dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-left: 4px;
  border-radius: 50%;
  background: var(--color-gold-500);
}

.admin-site__section h2 {
  margin: 0;
}

.admin-site__where {
  margin: 4px 0 var(--space-4);
  font-size: 0.92rem;
  line-height: 1.45;
  color: var(--color-ink-muted);
}

.admin-site__note {
  margin: 0 0 var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--color-surface-muted);
  font-size: 0.85rem;
}

.admin-site__field + .admin-site__field {
  margin-top: var(--space-4);
}

.admin-site__field--image {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: flex-start;
}

.admin-site__preview {
  width: 140px;
  height: 100px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  background: var(--color-surface-muted);
}

.admin-site__image-info {
  display: grid;
  gap: 6px;
  flex: 1;
  min-width: 180px;
}

.admin-site__image-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.admin-site__label-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  font-weight: 600;
}

.admin-site__changed {
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  background: var(--color-gold-100);
  color: var(--color-ink);
  font-size: 0.72rem;
  font-weight: 700;
}

.admin-site__reset {
  margin-left: auto;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-fill-700);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
}

.admin-site__hint {
  display: block;
  font-size: 0.78rem;
  font-weight: 400;
  color: var(--color-ink-muted);
}

/* Liga/desliga seção */
.admin-site__toggle {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  cursor: pointer;
  font-weight: 600;
}

.admin-site__toggle input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.admin-site__switch {
  flex: none;
  position: relative;
  width: 44px;
  height: 26px;
  border-radius: 999px;
  background: var(--color-border);
  transition: background var(--duration-fast) var(--ease-standard);
}

.admin-site__switch span {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  transition: transform var(--duration-fast) var(--ease-standard);
}

.admin-site__toggle input:checked + .admin-site__switch {
  background: var(--color-fill-700);
}

.admin-site__toggle input:checked + .admin-site__switch span {
  transform: translateX(18px);
}

.admin-site__toggle input:focus-visible + .admin-site__switch {
  outline: 2px solid var(--color-fill-700);
  outline-offset: 2px;
}

/* Pré-visualização */
.admin-site__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  justify-content: space-between;
}

.admin-site__segmented {
  display: inline-flex;
  padding: 3px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-muted);
}

.admin-site__segmented button {
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-ink-muted);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.admin-site__segmented button.is-active {
  background: var(--color-surface);
  color: var(--color-ink);
  box-shadow: var(--shadow-sm);
}

.admin-site__mode-hint {
  margin: var(--space-2) 0 var(--space-3);
  font-size: 0.82rem;
  color: var(--color-ink-muted);
}

.admin-site__frame-box {
  height: min(calc(100vh - 300px), 760px);
  min-height: 420px;
  overflow: hidden;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface-muted);
}

.admin-site__frame-scale {
  margin: 0 auto;
  overflow: hidden;
}

.admin-site__frame-scale iframe {
  display: block;
  border: 0;
  transform-origin: top left;
  background: #fff;
}
</style>
