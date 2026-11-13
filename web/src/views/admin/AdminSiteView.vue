<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { apiRequest, ApiError } from '@/services/api';
import { SITE_SECTIONS, SITE_DEFAULTS } from '@/data/site-content';
import { useSiteContentStore } from '@/stores/siteContent';
import { assetUrl } from '@/utils/images';
import ImageUploadButton from '@/components/admin/ImageUploadButton.vue';
import LoadingState from '@/components/LoadingState.vue';

// Painel → Site: a clínica edita os textos e troca as fotos do site
// público. Campo vazio ou "Voltar ao padrão" = texto/foto original.
const site = useSiteContentStore();
const loading = ref(true);
const values = reactive<Record<string, string>>({});
const original = ref<Record<string, string>>({});

onMounted(async () => {
  await site.load(true);
  for (const key of Object.keys(SITE_DEFAULTS)) values[key] = site.get(key);
  original.value = { ...values };
  loading.value = false;
});

const changedKeys = computed(() => Object.keys(values).filter((k) => values[k] !== original.value[k]));

const saving = ref(false);
const message = ref<{ ok: boolean; text: string } | null>(null);

async function save() {
  if (!changedKeys.value.length) return;
  saving.value = true;
  message.value = null;
  const content: Record<string, string | null> = {};
  for (const key of changedKeys.value) {
    const value = values[key].trim();
    // Vazio ou igual ao padrão: guarda como "padrão" (segue o site se o texto padrão mudar).
    content[key] = !value || value === SITE_DEFAULTS[key] ? null : value;
  }
  try {
    const res = await apiRequest<{ content: Record<string, string> }>('/site-content', { method: 'PUT', body: JSON.stringify({ content }) });
    site.saved = res.content;
    for (const key of Object.keys(SITE_DEFAULTS)) values[key] = site.get(key);
    original.value = { ...values };
    message.value = { ok: true, text: 'Salvo! O site já mostra as mudanças.' };
  } catch (err) {
    message.value = { ok: false, text: err instanceof ApiError ? err.message : 'Não foi possível salvar. Tente de novo.' };
  } finally {
    saving.value = false;
  }
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
        <p>Textos e fotos do site público. As mudanças aparecem para as clientes assim que você salva.</p>
      </div>
      <div class="admin-site__actions">
        <a href="/" target="_blank" rel="noopener" class="button button--ghost">Ver o site</a>
        <button type="button" class="button button--primary" :disabled="saving || !changedKeys.length" @click="save">
          {{ saving ? 'Salvando…' : changedKeys.length ? `Salvar (${changedKeys.length})` : 'Salvo' }}
        </button>
      </div>
    </div>
    <p v-if="message" class="admin-site__message" :class="{ 'admin-site__message--error': !message.ok }">{{ message.text }}</p>

    <LoadingState v-if="loading" label="Carregando textos do site…" />

    <div v-else class="admin-site__sections">
      <section v-for="section in SITE_SECTIONS" :key="section.title" class="admin-card admin-site__section">
        <div class="admin-site__section-head">
          <h2>{{ section.title }}</h2>
          <a :href="section.page" target="_blank" rel="noopener" class="admin-site__see">Ver página ↗</a>
        </div>

        <div v-for="field in section.fields" :key="field.key" class="admin-site__field" :class="{ 'admin-site__field--image': field.kind === 'image' }">
          <template v-if="field.kind === 'image'">
            <img class="admin-site__preview" :src="assetUrl(values[field.key])" :alt="field.label" loading="lazy" decoding="async" />
            <div class="admin-site__image-info">
              <span class="admin-site__label">{{ field.label }}</span>
              <small v-if="field.hint" class="admin-site__hint">{{ field.hint }}</small>
              <div class="admin-site__image-actions">
                <ImageUploadButton @uploaded="(url) => (values[field.key] = url)" />
                <button v-if="values[field.key] !== field.default" type="button" class="admin-site__reset" @click="resetField(field.key)">
                  Voltar à foto original
                </button>
              </div>
            </div>
          </template>
          <label v-else class="admin-field">
            <span class="admin-site__label-row">
              {{ field.label }}
              <button v-if="values[field.key] !== field.default" type="button" class="admin-site__reset" @click="resetField(field.key)">
                Voltar ao padrão
              </button>
            </span>
            <textarea v-if="field.kind === 'textarea'" v-model="values[field.key]" rows="3" maxlength="600" />
            <input v-else v-model="values[field.key]" type="text" maxlength="600" />
            <small v-if="field.hint" class="admin-site__hint">{{ field.hint }}</small>
          </label>
        </div>
      </section>
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
  margin-bottom: var(--space-5);
}

.admin-site__header p {
  color: var(--color-ink-muted);
}

.admin-site__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
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

.admin-site__sections {
  display: grid;
  gap: var(--space-5);
}

.admin-site__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.admin-site__section-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-3);
}

.admin-site__section-head h2 {
  font-size: 1.1rem;
}

.admin-site__see {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-rose-700);
}

.admin-site__field textarea {
  resize: vertical;
}

.admin-site__field--image {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr);
  gap: var(--space-4);
  align-items: center;
}

.admin-site__preview {
  width: 140px;
  height: 140px;
  object-fit: cover;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface-muted);
}

.admin-site__image-info {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.admin-site__image-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.admin-site__label {
  font-size: 0.85rem;
  font-weight: 600;
}

.admin-site__label-row {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
}

.admin-site__hint {
  color: var(--color-ink-muted);
  font-weight: 400;
}

.admin-site__reset {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-rose-700);
}

@media (max-width: 520px) {
  .admin-site__field--image {
    grid-template-columns: 96px minmax(0, 1fr);
  }

  .admin-site__preview {
    width: 96px;
    height: 96px;
  }
}
</style>
