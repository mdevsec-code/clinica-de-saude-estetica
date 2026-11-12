<script setup lang="ts">
withDefaults(defineProps<{ label?: string }>(), { label: 'Carregando…' });
</script>

<template>
  <!-- Esqueleto da tela no lugar do círculo girando: blocos no formato de
       título e cartões, com um brilho champagne atravessando. Dá a forma do
       que vem (lê como "quase pronto", não "travado") e é barato — o brilho
       é um pseudo-elemento movido com transform. -->
  <div class="loading" role="status" aria-live="polite">
    <div class="loading__bars" aria-hidden="true">
      <span class="sk sk--title" />
      <span class="sk sk--line" />
      <div class="loading__cards">
        <span class="sk sk--card" />
        <span class="sk sk--card" />
        <span class="sk sk--card" />
      </div>
    </div>
    <span class="loading__label">
      <span class="loading__dots" aria-hidden="true"><i /><i /><i /></span>
      {{ label }}
    </span>
  </div>
</template>

<style scoped>
.loading {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  min-height: 240px;
  padding: var(--space-6) 0;
  color: var(--color-ink-muted);
  opacity: 0;
  animation: loading-fade-in 0.35s var(--ease-premium) 0.12s forwards;
}

.loading__bars {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.loading__cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-4);
  margin-top: var(--space-3);
}

.sk {
  position: relative;
  display: block;
  overflow: hidden;
  border-radius: 12px;
  background: linear-gradient(90deg, rgba(220, 171, 168, 0.28), rgba(244, 234, 214, 0.45));
}

.sk::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(100deg, transparent 20%, rgba(255, 255, 255, 0.75) 50%, transparent 80%);
  transform: translateX(-100%);
  animation: sk-shine 1.6s var(--ease-premium) infinite;
}

.sk--title {
  width: min(320px, 70%);
  height: 30px;
}

.sk--line {
  width: min(520px, 90%);
  height: 14px;
  border-radius: 8px;
}

.sk--card {
  height: 120px;
  border-radius: var(--radius-lg);
}

.sk--card:nth-child(2)::after { animation-delay: 0.15s; }
.sk--card:nth-child(3)::after { animation-delay: 0.3s; }

.loading__label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.85rem;
  font-weight: 600;
}

.loading__dots {
  display: inline-flex;
  gap: 4px;
}

.loading__dots i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-rose-500);
  animation: dot 1.1s ease-in-out infinite;
}

.loading__dots i:nth-child(2) { animation-delay: 0.15s; }
.loading__dots i:nth-child(3) { animation-delay: 0.3s; }

@keyframes sk-shine {
  to { transform: translateX(100%); }
}

@keyframes dot {
  0%, 100% { transform: translateY(0); opacity: 0.4; }
  50% { transform: translateY(-4px); opacity: 1; }
}

@keyframes loading-fade-in {
  to { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .loading {
    opacity: 1;
    animation: none;
  }
  .sk::after,
  .loading__dots i {
    animation: none;
  }
}
</style>
