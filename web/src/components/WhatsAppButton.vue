<script setup lang="ts">
import { computed } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { whatsappLink } from '@/services/settings.service';

withDefaults(defineProps<{ variant?: 'floating' | 'inline'; label?: string; message?: string }>(), {
  variant: 'floating',
  label: 'Falar pelo WhatsApp',
  message: 'Olá! Vim pelo site e gostaria de agendar um horário.',
});

const settings = useSettingsStore();
settings.load();

const href = computed(() => {
  const whatsapp = settings.data?.whatsapp;
  if (!whatsapp) return null;
  return whatsappLink(whatsapp, 'Olá! Vim pelo site e gostaria de agendar um horário.');
});
</script>

<template>
  <a
    v-if="href"
    :href="href"
    target="_blank"
    rel="noopener"
    :class="['whatsapp-btn', `whatsapp-btn--${variant}`]"
    :aria-label="label"
  >
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
      <path
        d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.28-1.39a9.9 9.9 0 0 0 4.76 1.21h.01c5.46 0 9.9-4.45 9.9-9.91C21.96 6.45 17.5 2 12.04 2Zm0 18.02a8.17 8.17 0 0 1-4.16-1.14l-.3-.18-3.13.82.84-3.05-.19-.31a8.13 8.13 0 0 1-1.25-4.35c0-4.5 3.66-8.16 8.19-8.16 4.52 0 8.19 3.66 8.19 8.16 0 4.51-3.67 8.21-8.19 8.21Zm4.48-6.13c-.24-.12-1.44-.71-1.66-.79-.22-.08-.39-.12-.55.12-.16.24-.63.79-.78.95-.14.16-.28.18-.53.06-.24-.12-1.02-.38-1.94-1.2-.72-.64-1.2-1.43-1.35-1.67-.14-.24-.02-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.42-.55-.42h-.47c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.11 3.64.58.25 1.03.4 1.38.51.58.18 1.11.16 1.53.1.47-.07 1.44-.59 1.64-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28Z"
      />
    </svg>
    <span v-if="variant === 'inline'">{{ label }}</span>
  </a>
</template>

<style scoped>
.whatsapp-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: #fff;
  background: #25d366;
  border-radius: var(--radius-pill);
  transition: transform var(--duration-fast) var(--ease-standard);
}

.whatsapp-btn--inline {
  padding: 12px 20px;
  font-weight: 600;
}

.whatsapp-btn--floating {
  position: fixed;
  right: var(--space-4);
  bottom: var(--space-4);
  width: 56px;
  height: 56px;
  justify-content: center;
  box-shadow: var(--shadow-md);
  z-index: 50;
}

.whatsapp-btn:hover {
  transform: translateY(-2px);
}

@media (min-width: 900px) {
  .whatsapp-btn--floating {
    right: var(--space-6);
    bottom: var(--space-6);
  }
}
</style>
