<script setup lang="ts">
import { computed, nextTick, watch } from 'vue';
import { useBookingStore } from '@/stores/booking';
import { applyMagneticButtons } from '@/composables/useMagneticButton';

const booking = useBookingStore();

defineProps<{ ctaLabel: string; ctaDisabled?: boolean }>();
defineEmits<{ continue: [] }>();

// O botão só existe no DOM quando booking.selectedService está preenchido
// (v-if no template) — chamar isso de um onMounted simples correria o risco
// de rodar antes desse v-if liberar o botão pela primeira vez. immediate:true
// cobre o caso comum de o serviço já estar selecionado quando este
// componente é criado (ex.: cliente voltando de /servicos).
watch(
  () => booking.selectedService,
  async (service) => {
    if (!service) return;
    await nextTick();
    applyMagneticButtons('.summary-bar__cta', 0.25);
  },
  { immediate: true },
);

function formatPrice(price: number | null | undefined) {
  if (price == null) return 'Consulte';
  return price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const timeLabel = computed(() => {
  if (!booking.selectedSlot) return null;
  return new Date(booking.selectedSlot.startAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bahia',
  });
});
</script>

<template>
  <div v-if="booking.selectedService" class="summary-bar">
    <div class="summary-bar__info">
      <p class="summary-bar__title">Seu atendimento</p>
      <p class="summary-bar__service summary-bar__truncate">{{ booking.selectedService.name }}</p>
      <p class="summary-bar__meta summary-bar__truncate">
        {{ booking.selectedService.durationMinutes }} min · {{ formatPrice(booking.selectedService.price) }}
        <span v-if="timeLabel"> · {{ timeLabel }}</span>
      </p>
    </div>
    <button type="button" class="summary-bar__cta" :disabled="ctaDisabled" @click="$emit('continue')">
      {{ ctaLabel }}
    </button>
  </div>
</template>

<style scoped>
.summary-bar {
  position: sticky;
  bottom: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  box-shadow: var(--shadow-lg);
  padding: var(--space-3) var(--space-4);
  padding-bottom: calc(var(--space-3) + env(safe-area-inset-bottom));
}

.summary-bar__info {
  /* Sem isto, um nome de serviço longo nunca encolheria abaixo da própria
     palavra mais longa dentro do flex, podendo empurrar o botão para fora
     da tela em telas bem estreitas. */
  min-width: 0;
}

.summary-bar__truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-bar__title {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-ink-soft);
}

.summary-bar__service {
  font-weight: 600;
  color: var(--color-ink);
}

.summary-bar__meta {
  font-size: 0.85rem;
  color: var(--color-rose-700);
}

.summary-bar__cta {
  flex-shrink: 0;
  background: linear-gradient(135deg, var(--color-rose-700), var(--color-rose-900));
  color: #fff;
  border: none;
  padding: 12px 22px;
  border-radius: var(--radius-pill);
  font-weight: 700;
  cursor: pointer;
  transition: transform var(--duration-base) var(--ease-premium), box-shadow var(--duration-base) var(--ease-premium);
}

.summary-bar__cta:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.summary-bar__cta:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
