<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{ data: { label: string; value: number; color: string }[]; centerLabel?: string; size?: number }>(),
  { size: 132 },
);

// Anel construído com stroke-dasharray/offset por segmento (SVG puro, sem
// lib de gráfico) — cada fatia é um <circle> cheio com um traço tracejado do
// tamanho exato da sua fração da circunferência, girado para começar onde a
// fatia anterior terminou. r=15,915... é o raio que dá circunferência ~100,
// então cada dasharray pode ser lido direto como porcentagem.
const RADIUS = 15.9155;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const total = computed(() => props.data.reduce((sum, d) => sum + d.value, 0));

const segments = computed(() => {
  let offset = 0;
  return props.data
    .filter((d) => d.value > 0)
    .map((d) => {
      const fraction = total.value > 0 ? d.value / total.value : 0;
      const length = fraction * CIRCUMFERENCE;
      const seg = { ...d, length, offset: -offset, fraction };
      offset += length;
      return seg;
    });
});
</script>

<template>
  <div class="donut" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg viewBox="0 0 36 36" class="donut__svg">
      <circle
        v-if="!total"
        cx="18"
        cy="18"
        r="15.9155"
        fill="none"
        stroke="var(--color-surface-muted)"
        stroke-width="4"
      />
      <circle
        v-for="seg in segments"
        :key="seg.label"
        cx="18"
        cy="18"
        r="15.9155"
        fill="none"
        :stroke="seg.color"
        stroke-width="4"
        stroke-linecap="butt"
        :stroke-dasharray="`${seg.length} ${CIRCUMFERENCE - seg.length}`"
        :stroke-dashoffset="seg.offset"
        transform="rotate(-90 18 18)"
        class="donut__seg"
      >
        <title>{{ seg.label }}: {{ seg.value }} ({{ Math.round(seg.fraction * 100) }}%)</title>
      </circle>
    </svg>
    <div class="donut__center">
      <span class="donut__total">{{ total }}</span>
      <span v-if="centerLabel" class="donut__label">{{ centerLabel }}</span>
    </div>
  </div>
</template>

<style scoped>
.donut {
  container-type: inline-size;
  position: relative;
  flex-shrink: 0;
}

.donut__svg {
  width: 100%;
  height: 100%;
}

.donut__seg {
  transition: opacity var(--duration-fast) var(--ease-standard);
}

.donut:hover .donut__seg {
  opacity: 0.55;
}

.donut__seg:hover {
  opacity: 1 !important;
}

.donut__center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.donut__total {
  font-family: var(--font-display);
  font-size: clamp(1.7rem, 12cqw, 2.2rem);
  font-weight: 600;
  color: var(--color-ink);
  line-height: 1;
}

.donut__label {
  font-size: 0.68rem;
  color: var(--color-ink-soft);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 2px;
}
</style>
