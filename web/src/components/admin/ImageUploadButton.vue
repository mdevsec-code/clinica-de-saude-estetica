<script setup lang="ts">
import { ref } from 'vue';
import { apiRequest, ApiError } from '@/services/api';

// Botão "Enviar foto": a pessoa escolhe a foto (galeria do celular ou
// arquivo), o próprio navegador reduz para no máximo 1800px em JPEG (uma
// foto de 5 MB do celular vira ~300 KB — o site continua leve) e envia.
// Emite o caminho público da foto salva.
const props = withDefaults(defineProps<{ label?: string }>(), { label: 'Trocar foto' });
const emit = defineEmits<{ uploaded: [url: string] }>();

const input = ref<HTMLInputElement | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);

const MAX_SIDE = 1800;

async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.86).split(',')[1];
}

async function onPick(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  (event.target as HTMLInputElement).value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    error.value = 'Escolha um arquivo de imagem.';
    return;
  }
  busy.value = true;
  error.value = null;
  try {
    const base64Data = await shrink(file);
    const { url } = await apiRequest<{ url: string }>('/site-content/images', {
      method: 'POST',
      body: JSON.stringify({ mimeType: 'image/jpeg', base64Data }),
    });
    emit('uploaded', url);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Não foi possível enviar a foto. Tente outra imagem.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <span class="img-upload">
    <button type="button" class="button button--ghost img-upload__btn" :disabled="busy" @click="input?.click()">
      {{ busy ? 'Enviando…' : props.label }}
    </button>
    <input ref="input" type="file" accept="image/*" hidden @change="onPick" />
    <small v-if="error" class="img-upload__error">{{ error }}</small>
  </span>
</template>

<style scoped>
.img-upload {
  display: inline-flex;
  flex-direction: column;
  gap: 4px;
}

.img-upload__btn {
  padding: 8px 16px;
  font-size: 0.85rem;
}

.img-upload__error {
  color: var(--color-danger);
  font-size: 0.8rem;
}
</style>
