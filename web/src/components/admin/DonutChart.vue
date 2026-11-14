<script setup lang="ts">
import { computed, ref } from 'vue';
import { gsap } from '@/lib/motion';
import { useChartEntrance } from '@/composables/useChartEntrance';

const props = withDefaults(
  defineProps<{
    data: { label: string; value: number; color: string }[];
    centerLabel?: string;
    size?: number;
    // Fatia destacada de fora (ex.: mouse na legenda); o centro mostra ela.
    highlight?: string | null;
  }>(),
  { size: 132, highlight: null },
);
const emit = defineEmits<{ hover: [label: string | null] }>();
const hovered = ref<string | null>(null);
const activeLabel = computed(() => hovered.value ?? props.highlight);
function setHover(label: string | null) {
  hovered.value = label;
  emit('hover', label);
}

// Anel construído com stroke-dasharray/offset por segmento (SVG puro, sem
// lib de gráfico) — cada fatia é um <circle> cheio com um traço tracejado do
// tamanho exato da sua fração da circunferência, girado para começar onde a
// fatia anterior terminou. r=15,915... é o raio que dá circunferência ~100,
// então cada dasharray pode ser lido direto como porcentagem.
const RADIUS = 15.9155;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const STROKE = 5;
// Ponta arredondada avança STROKE/2 de cada lado: desconta isso e mais um
// respiro para as fatias não se encostarem.
const GAP = STROKE + 1.4;

const total = computed(() => props.data.reduce((sum, d) => sum + d.value, 0));

// Os segmentos se desenham um após o outro, no sentido horário (cada um
// parte de traço zero até a sua fração), e o total no centro conta junto.
const root = useChartEntrance(
  () => props.data,
  (el) => {
    const segs = el.querySelectorAll<SVGCircleElement>('.donut__seg');
    const tl = gsap.timeline({ defaults: { ease: 'premium-in-out' } });
    segs.forEach((seg) => {
      const [length] = (seg.getAttribute('stroke-dasharray') ?? '0').split(' ').map(Number);
      const share = length / CIRCUMFERENCE;
      tl.from(seg, { attr: { 'stroke-dasharray': `0 ${CIRCUMFERENCE}` }, duration: 0.25 + share * 0.9 });
    });
    const totalEl = el.querySelector('.donut__total');
    if (totalEl && total.value > 0) {
      const counter = { value: 0 };
      gsap.to(counter, {
        value: total.value,
        duration: Math.max(0.6, tl.duration()),
        ease: 'power2.out',
        onUpdate: () => {
          totalEl.textContent = String(Math.round(counter.value));
        },
      });
    }
  },
);

const segments = computed(() => {
  let offset = 0;
  return props.data
    .filter((d) => d.value > 0)
    .map((d) => {
      const fraction = total.value > 0 ? d.value / total.value : 0;
      const full = fraction * CIRCUMFERENCE;
      const single = props.data.filter((x) => x.value > 0).length === 1;
      // Fatia única: anel inteiro, sem ponta. Fatia mínima vira um ponto.
      const length = single ? full : Math.max(0.01, full - GAP);
      const seg = { ...d, length, offset: -(offset + (single ? 0 : GAP / 2)), fraction, single };
      offset += full;
      return seg;
    });
});
const active = computed(() => segments.value.find((s) => s.label === activeLabel.value) ?? null);
</script>

<template>
  <div ref="root" class="donut" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg viewBox="-1 -1 38 38" class="donut__svg">
      <circle cx="18" cy="18" r="15.9155" fill="none" class="donut__track" :stroke-width="STROKE" />
      <circle
        v-for="seg in segments"
        :key="seg.label"
        cx="18"
        cy="18"
        r="15.9155"
        fill="none"
        :stroke="seg.color"
        :stroke-width="STROKE"
        :stroke-linecap="seg.single ? 'butt' : 'round'"
        :stroke-dasharray="`${seg.length} ${CIRCUMFERENCE - seg.length}`"
        :stroke-dashoffset="seg.offset"
        transform="rotate(-90 18 18)"
        class="donut__seg"
        :class="{ 'is-dim': active && active.label !== seg.label, 'is-active': active?.label === seg.label }"
        @mouseenter="setHover(seg.label)"
        @mouseleave="setHover(null)"
        @touchstart.passive="setHover(seg.label)"
      >
        <title>{{ seg.label }}: {{ seg.value }} ({{ Math.round(seg.fraction * 100) }}%)</title>
      </circle>
    </svg>
    <div class="donut__center">
      <template v-if="active">
        <span class="donut__pct" :style="{ color: active.color }">{{ Math.round(active.fraction * 100) }}%</span>
        <span class="donut__label">{{ active.value }} · {{ active.label.toLowerCase() }}</span>
      </template>
      <template v-else>
        <span class="donut__total">{{ total }}</span>
        <span v-if="centerLabel" class="donut__label">{{ centerLabel }}</span>
      </template>
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

.donut__track {
  stroke: var(--color-surface-muted);
}

.donut__seg {
  cursor: pointer;
  transition: opacity var(--duration-fast) var(--ease-standard), stroke-width var(--duration-fast) var(--ease-standard);
}

.donut__seg.is-dim {
  opacity: 0.3;
}

.donut__seg.is-active {
  stroke-width: 6.4;
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

.donut__pct {
  font-family: var(--font-display);
  font-size: clamp(1.5rem, 11cqw, 2rem);
  font-weight: 600;
  line-height: 1;
}

.donut__label {
  max-width: 70%;
  text-align: center;
  font-size: 0.72rem;
  color: var(--color-ink-soft);
  text-transform: none;
  letter-spacing: 0;
  margin-top: 2px;
}
</style>
