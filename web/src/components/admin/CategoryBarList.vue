<script setup lang="ts">
import { computed } from 'vue';
import type { ExpenseCategory } from '@/types';

const props = defineProps<{ data: { category: ExpenseCategory; totalCents: number }[] }>();

// Paleta categórica: hue fixo por categoria, SEMPRE na mesma ordem/slot,
// independente de quais categorias aparecem nos dados filtrados — nunca
// "repintar" o que sobrou depois de um filtro (regra do método de dataviz:
// cor segue a entidade, não o ranking). Valores validados via
// validate_palette.js (6 slots, modo claro, sobre --color-bg): todos os
// checks de separação passam; 4 dos 6 tons ficam abaixo de 3:1 de contraste
// contra o fundo, por isso os rótulos de valor abaixo são SEMPRE visíveis
// (não dependem da cor para comunicar a magnitude).
const CATEGORY_META: Record<ExpenseCategory, { label: string; color: string }> = {
  PRODUTOS: { label: 'Produtos', color: 'var(--chart-cat-1)' },
  EQUIPAMENTOS: { label: 'Equipamentos', color: 'var(--chart-cat-2)' },
  ALUGUEL: { label: 'Aluguel', color: 'var(--chart-cat-3)' },
  MARKETING: { label: 'Marketing', color: 'var(--chart-cat-4)' },
  SALARIOS: { label: 'Salários', color: 'var(--chart-cat-5)' },
  OUTROS: { label: 'Outros', color: 'var(--chart-cat-6)' },
};
const CATEGORY_ORDER: ExpenseCategory[] = ['PRODUTOS', 'EQUIPAMENTOS', 'ALUGUEL', 'MARKETING', 'SALARIOS', 'OUTROS'];

const rows = computed(() => {
  const byCategory = new Map(props.data.map((d) => [d.category, d.totalCents]));
  const max = Math.max(1, ...props.data.map((d) => d.totalCents));
  return CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((category) => ({
    category,
    totalCents: byCategory.get(category) ?? 0,
    pct: ((byCategory.get(category) ?? 0) / max) * 100,
    ...CATEGORY_META[category],
  }));
});

function formatCurrency(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
</script>

<template>
  <ul class="category-bars">
    <li v-for="row in rows" :key="row.category" class="category-bars__row">
      <span class="category-bars__label">{{ row.label }}</span>
      <div class="category-bars__track">
        <div class="category-bars__fill" :style="{ width: `${row.pct}%`, background: row.color }" />
      </div>
      <span class="category-bars__value">{{ formatCurrency(row.totalCents) }}</span>
    </li>
  </ul>
</template>

<style scoped>
.category-bars {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.category-bars__row {
  display: grid;
  grid-template-columns: 96px 1fr auto;
  align-items: center;
  gap: var(--space-3);
}

.category-bars__label {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-ink);
}

.category-bars__track {
  height: 10px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-muted);
  overflow: hidden;
}

.category-bars__fill {
  height: 100%;
  border-radius: var(--radius-pill);
  min-width: 4px;
  transition: width 0.6s var(--ease-premium);
}

.category-bars__value {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--color-ink);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
