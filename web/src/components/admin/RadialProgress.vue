<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{ value: number | null; color?: string; trackColor?: string; size?: number }>(),
  { color: 'var(--color-rose-700)', trackColor: 'var(--color-surface-muted)', size: 88 },
);

const RADIUS = 15.9155;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const pct = computed(() => Math.max(0, Math.min(100, props.value ?? 0)));
const dash = computed(() => (pct.value / 100) * CIRCUMFERENCE);
</script>

<template>
  <div class="radial" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg viewBox="0 0 36 36" class="radial__svg">
      <circle cx="18" cy="18" r="15.9155" fill="none" :stroke="trackColor" stroke-width="4" />
      <circle
        v-if="value != null"
        cx="18"
        cy="18"
        r="15.9155"
        fill="none"
        :stroke="color"
        stroke-width="4"
        stroke-linecap="round"
        :stroke-dasharray="`${dash} ${CIRCUMFERENCE - dash}`"
        transform="rotate(-90 18 18)"
        class="radial__fill"
      />
    </svg>
    <div class="radial__center">
      <span v-if="value != null" class="radial__value">{{ Math.round(value) }}%</span>
      <span v-else class="radial__value radial__value--empty">—</span>
    </div>
  </div>
</template>

<style scoped>
.radial {
  position: relative;
  flex-shrink: 0;
}

.radial__svg {
  width: 100%;
  height: 100%;
}

.radial__fill {
  transition: stroke-dasharray 0.6s var(--ease-premium);
}

.radial__center {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.radial__value {
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--color-ink);
}

.radial__value--empty {
  color: var(--color-ink-soft);
  font-family: var(--font-body);
}
</style>
