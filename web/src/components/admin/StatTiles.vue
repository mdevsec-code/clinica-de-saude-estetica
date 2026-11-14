<script setup lang="ts">
// Faixa de números em blocos coloridos (vinho, rosé, dourado, sálvia) no topo
// das telas do painel — o mesmo desenho dos indicadores do Painel.
defineProps<{ tiles: { label: string; value: string | number; hint?: string }[] }>();
const TONES = ['wine', 'rose', 'gold', 'sage'];
</script>

<template>
  <div class="tiles">
    <div v-for="(t, i) in tiles" :key="t.label" class="tile" :class="`tile--${TONES[i % 4]}`">
      <span class="tile__label">{{ t.label }}</span>
      <strong class="tile__value">{{ t.value }}</strong>
      <span v-if="t.hint" class="tile__hint">{{ t.hint }}</span>
    </div>
  </div>
</template>

<style scoped>
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: var(--space-4);
  margin-bottom: var(--space-5);
}

.tile {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: var(--space-4) var(--space-5);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  color: #fff;
}

.tile::after {
  content: '';
  position: absolute;
  right: -36px;
  top: -36px;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  pointer-events: none;
}

.tile--wine { background: var(--fill-wine); }
.tile--rose { background: var(--fill-rose); }
.tile--gold { background: var(--fill-gold); color: #3a2a17; }
.tile--sage { background: var(--fill-sage); }

.tile__label,
.tile__hint {
  font-size: 0.85rem;
  opacity: 0.85;
}

.tile__value {
  font-family: var(--font-display);
  font-size: 1.8rem;
  font-weight: 600;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

@media (max-width: 640px) {
  .tiles {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
  }

  .tile {
    padding: var(--space-3) var(--space-4);
  }

  .tile__value {
    font-size: 1.35rem;
  }
}
</style>
