<script setup lang="ts">
import { computed } from 'vue';

// Gráfico de barras sequencial (magnitude — "quantos agendamentos por dia"),
// uma única cor conforme o método de dataviz usado no projeto: sequencial =
// um hue só, nunca uma cor por barra (isso seria gastar o canal categórico
// para codificar o que a própria altura da barra já mostra).
const props = withDefaults(
  defineProps<{
    data: { label: string; value: number }[];
    color?: string;
  }>(),
  { color: 'var(--chart-seq-500)' },
);

const max = computed(() => Math.max(1, ...props.data.map((d) => d.value)));

// Com o seletor de período (7/14/30/60/90 dias, ver AdminDashboardView),
// espremer todas as colunas na mesma largura fixa do card virava exatamente
// o bug relatado: em 60-90 dias cada barra ficava fina demais pra ver e os
// rótulos do eixo (um número por dia) se sobrepunham uns aos outros até
// virar uma sopa de dígitos ilegível. Duas medidas independentes resolvem
// isso: 1) cada coluna tem uma largura mínima real (16px) — a partir de ~24
// colunas o gráfico vira scroll horizontal em vez de continuar espremendo;
// 2) só uma fração dos rótulos é desenhada (o resto fica com o espaço
// reservado, mas em branco) — mostrar TODO dia num intervalo de 90 nunca
// caberia de forma legível, então mostramos só ~12-14 marcos espaçados,
// sempre incluindo o último dia (hoje).
const MIN_COL_WIDTH = 16;
const needsScroll = computed(() => props.data.length > 24);
const colWidthPx = computed(() => (needsScroll.value ? MIN_COL_WIDTH : null));
const innerMinWidth = computed(() => (needsScroll.value ? `${props.data.length * (MIN_COL_WIDTH + 4)}px` : '100%'));

const labelStep = computed(() => Math.max(1, Math.ceil(props.data.length / 14)));
function showLabel(i: number) {
  return i === props.data.length - 1 || i % labelStep.value === 0;
}
</script>

<template>
  <div class="bar-chart">
    <div class="bar-chart__scroll" :class="{ 'bar-chart__scroll--active': needsScroll }">
      <div class="bar-chart__inner" :style="{ minWidth: innerMinWidth }">
        <div class="bar-chart__plot">
          <div
            v-for="(d, i) in data"
            :key="i"
            class="bar-chart__col"
            :style="colWidthPx ? { flex: `0 0 ${colWidthPx}px` } : undefined"
          >
            <span class="bar-chart__value">{{ d.value }}</span>
            <div
              class="bar-chart__bar"
              :class="{ 'bar-chart__bar--today': i === data.length - 1 }"
              :style="{ height: `${Math.max(2, (d.value / max) * 100)}%` }"
              :title="`${d.label}: ${d.value}`"
            />
          </div>
        </div>
        <div class="bar-chart__labels">
          <span
            v-for="(d, i) in data"
            :key="i"
            class="bar-chart__labels-item"
            :class="{ 'bar-chart__labels--today': i === data.length - 1 }"
            :style="colWidthPx ? { flex: `0 0 ${colWidthPx}px` } : undefined"
          >{{ showLabel(i) ? d.label : '' }}</span>
        </div>
      </div>
    </div>
    <p v-if="needsScroll" class="bar-chart__hint">Arraste para o lado para ver o período completo</p>
  </div>
</template>

<style scoped>
.bar-chart {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bar-chart__scroll {
  overflow-x: auto;
}

.bar-chart__scroll--active {
  padding-bottom: 2px;
}

.bar-chart__inner {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bar-chart__plot {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 180px;
  border-bottom: 1px solid var(--color-border);
}

.bar-chart__col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  min-width: 0;
}

.bar-chart__value {
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--color-ink-muted);
  opacity: 0;
  transform: translateY(2px);
  transition: opacity var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard);
  margin-bottom: 2px;
}

.bar-chart__col:hover .bar-chart__value {
  opacity: 1;
  transform: translateY(0);
}

.bar-chart__bar {
  width: 100%;
  max-width: 22px;
  border-radius: 4px 4px 0 0;
  background: linear-gradient(180deg, color-mix(in srgb, v-bind(color) 60%, white), v-bind(color));
  transition: opacity var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard);
  transform-origin: bottom center;
}

.bar-chart__bar--today {
  background: linear-gradient(180deg, color-mix(in srgb, var(--color-rose-700) 55%, white), var(--color-rose-900));
  box-shadow: 0 0 0 2px var(--color-rose-100);
}

.bar-chart__col:hover .bar-chart__bar {
  opacity: 0.8;
  transform: scaleX(1.15);
}

.bar-chart__labels {
  display: flex;
  gap: 4px;
}

.bar-chart__labels-item {
  flex: 1;
  text-align: center;
  font-size: 0.62rem;
  color: var(--color-ink-soft);
  min-width: 0;
  white-space: nowrap;
}

.bar-chart__labels--today {
  font-weight: 800;
  color: var(--color-rose-700);
}

.bar-chart__hint {
  font-size: 0.72rem;
  color: var(--color-ink-soft);
  text-align: center;
  margin: 0;
}
</style>
