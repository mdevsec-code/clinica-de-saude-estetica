<script setup lang="ts">
import { computed, ref, useId } from 'vue';

// Gráfico de área com curva suave e gradiente (painel): mesma entrada do
// BarChart. Passar o dedo/mouse mostra o valor do dia.
const props = withDefaults(
  defineProps<{
    data: { label: string; value: number }[];
    color?: string;
    valueFormatter?: (value: number) => string;
  }>(),
  { color: 'var(--color-rose-500)', valueFormatter: (v: number) => String(v) },
);

const W = 1000;
const H = 200;
const TOP = 16;
const id = useId();
const active = ref<number | null>(null);

const max = computed(() => Math.max(1, ...props.data.map((d) => d.value)));
const points = computed(() => {
  const n = props.data.length;
  return props.data.map((d, i) => ({ x: n < 2 ? W / 2 : (i / (n - 1)) * W, y: H - (d.value / max.value) * (H - TOP) }));
});

// Curva monotônica (Fritsch–Carlson): suave, mas nunca passa abaixo de zero
// nem acima do maior valor entre dois pontos — um dia com 0 fica no chão.
function monotonePath(pts: { x: number; y: number }[]) {
  if (!pts.length) return '';
  if (pts.length === 1) return `M0,${pts[0].y}L${W},${pts[0].y}`;
  const n = pts.length;
  const d = pts.slice(1).map((p, i) => (p.y - pts[i].y) / (p.x - pts[i].x));
  const m = pts.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  let path = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = (pts[i + 1].x - pts[i].x) / 3;
    path += `C${pts[i].x + h},${pts[i].y + m[i] * h} ${pts[i + 1].x - h},${pts[i + 1].y - m[i + 1] * h} ${pts[i + 1].x},${pts[i + 1].y}`;
  }
  return path;
}

const line = computed(() => monotonePath(points.value));
const area = computed(() => (line.value ? `${line.value}L${W},${H}L0,${H}Z` : ''));
// No máximo ~8 rótulos no eixo (90 dias não cabem um por um).
const labelStep = computed(() => Math.max(1, Math.ceil(props.data.length / 8)));
const pct = (x: number) => `${(x / W) * 100}%`;
</script>

<template>
  <div class="area" :style="{ '--area-color': color }" @mouseleave="active = null">
    <div class="area__plot">
      <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient :id="`${id}-fill`" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--area-color)" stop-opacity="0.38" />
            <stop offset="100%" stop-color="var(--area-color)" stop-opacity="0" />
          </linearGradient>
        </defs>
        <line v-for="g in 3" :key="g" class="area__grid" x1="0" :x2="W" :y1="TOP + ((H - TOP) / 3) * (g - 1)" :y2="TOP + ((H - TOP) / 3) * (g - 1)" />
        <path :d="area" :fill="`url(#${id}-fill)`" />
        <path :d="line" class="area__line" />
      </svg>

      <template v-if="active !== null && points[active]">
        <span class="area__guide" :style="{ left: pct(points[active].x) }" />
        <span class="area__dot" :style="{ left: pct(points[active].x), top: `${(points[active].y / H) * 100}%` }" />
        <span
          class="area__tip"
          :style="{ left: pct(points[active].x), top: `${(points[active].y / H) * 100}%`, '--tx': points[active].x < 150 ? '-12%' : points[active].x > 850 ? '-88%' : '-50%' }"
        >
          <strong>{{ valueFormatter(data[active].value) }}</strong> · {{ data[active].label }}
        </span>
      </template>

      <!-- Faixas invisíveis, uma por dia, para o hover/toque. -->
      <div class="area__hits">
        <span
          v-for="(d, i) in data"
          :key="i"
          :aria-label="`${d.label}: ${valueFormatter(d.value)}`"
          @mouseenter="active = i"
          @touchstart.passive="active = i"
        />
      </div>
    </div>

    <div class="area__axis">
      <span
        v-for="(d, i) in data"
        v-show="i % labelStep === (data.length - 1) % labelStep"
        :key="i"
        :class="{ 'is-last': i === data.length - 1 }"
        :style="{ left: pct(points[i]?.x ?? 0) }"
      >{{ d.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.area {
  position: relative;
  width: 100%;
}

.area__plot {
  position: relative;
  height: 220px;
}

.area__plot svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.area__grid {
  stroke: var(--color-border);
  stroke-dasharray: 4 6;
  vector-effect: non-scaling-stroke;
}

.area__line {
  fill: none;
  stroke: var(--area-color);
  stroke-width: 3;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.area__guide {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: color-mix(in srgb, var(--area-color) 45%, transparent);
  pointer-events: none;
}

.area__dot {
  position: absolute;
  width: 12px;
  height: 12px;
  margin: -6px 0 0 -6px;
  border-radius: 50%;
  background: var(--color-surface);
  border: 3px solid var(--area-color);
  pointer-events: none;
}

.area__tip {
  position: absolute;
  transform: translate(var(--tx, -50%), calc(-100% - 14px));
  padding: 5px 10px;
  border-radius: var(--radius-sm);
  background: var(--color-ink);
  color: var(--color-surface);
  font-size: 0.78rem;
  white-space: nowrap;
  pointer-events: none;
  z-index: 2;
}

.area__hits {
  position: absolute;
  inset: 0;
  display: flex;
}

.area__hits span {
  flex: 1;
}

.area__axis {
  position: relative;
  height: 22px;
  margin-top: 8px;
}

.area__axis span {
  position: absolute;
  transform: translateX(-50%);
  font-size: 0.72rem;
  color: var(--color-ink-soft);
}

.area__axis span:first-child {
  transform: none;
}

.area__axis span.is-last {
  transform: translateX(-100%);
  font-weight: 700;
  color: var(--color-ink);
}
</style>
