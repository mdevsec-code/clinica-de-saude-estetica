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
const progressPercent = computed(() => `${((currentIndex.value + 1) / steps.length) * 100}%`);
</script>

<template>
  <div class="progress-wrap">
    <!-- Abaixo de ~560px o <ol> horizontal (mesmo com overflow-x:auto) escondia
         as etapas finais fora da tela sem nenhuma pista visual de que dava
         pra arrastar — ruim justo num indicador de progresso, cujo papel é
         deixar claro quantos passos faltam. Uma barra + "Etapa X de N" some
         menos informação relevante nesse espaço do que a lista cortada.
         O <ol> continua completo no DOM (só escondido via CSS) para leitor
         de tela em telas largas; no compacto, o texto abaixo já comunica a
         mesma informação sozinho, então não duplicamos com aria-hidden nos
         dois ao mesmo tempo. -->
    <p class="progress__compact">Etapa {{ currentIndex + 1 }} de {{ steps.length }} — {{ steps[currentIndex].label }}</p>
    <div class="progress__bar" aria-hidden="true"><span class="progress__bar-fill" :style="{ width: progressPercent }" /></div>

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
  </div>
</template>

<style scoped>
.progress-wrap {
  width: 100%;
}

.progress__compact {
  display: none;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-ink);
  margin-bottom: var(--space-2);
}

.progress__bar {
  display: none;
  height: 4px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-muted);
  overflow: hidden;
}

.progress__bar-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--color-rose-700);
  transition: width var(--duration-base) var(--ease-standard);
}

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

@media (max-width: 560px) {
  .progress__compact,
  .progress__bar {
    display: block;
  }

  .progress {
    display: none;
  }
}
</style>
