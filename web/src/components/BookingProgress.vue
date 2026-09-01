<script setup lang="ts">
import { computed } from 'vue';
import type { BookingStep } from '@/stores/booking';

const props = defineProps<{ current: BookingStep }>();

const steps: { key: BookingStep; label: string }[] = [
  { key: 'service', label: 'Serviço' },
  { key: 'date', label: 'Data' },
  { key: 'time', label: 'Horário' },
  { key: 'details', label: 'Dados' },
  { key: 'confirmation', label: 'Confirmação' },
];

const currentIndex = computed(() => steps.findIndex((s) => s.key === props.current));
</script>

<template>
  <ol class="progress" aria-label="Etapas do agendamento">
    <li
      v-for="(step, index) in steps"
      :key="step.key"
      class="progress__step"
      :class="{
        'progress__step--done': index < currentIndex,
        'progress__step--active': index === currentIndex,
      }"
      :aria-current="index === currentIndex ? 'step' : undefined"
    >
      <span class="progress__dot">{{ index < currentIndex ? '✓' : index + 1 }}</span>
      <span class="progress__label">{{ step.label }}</span>
    </li>
  </ol>
</template>

<style scoped>
.progress {
  display: flex;
  list-style: none;
  margin: 0;
  padding: 0;
  gap: var(--space-2);
  overflow-x: auto;
}

.progress__step {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
  color: var(--color-ink-soft);
  font-size: 0.88rem;
}

.progress__dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 0.8rem;
}

.progress__step--active .progress__dot {
  border-color: var(--color-rose-700);
  background: var(--color-rose-700);
  color: #fff;
}

.progress__step--active .progress__label {
  color: var(--color-ink);
  font-weight: 600;
}

.progress__step--done .progress__dot {
  border-color: var(--color-rose-700);
  color: var(--color-rose-700);
}

.progress__step:not(:last-child)::after {
  content: '';
  width: 16px;
  height: 1px;
  background: var(--color-border);
  margin-inline: var(--space-1);
}
</style>
