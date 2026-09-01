<script setup lang="ts">
withDefaults(defineProps<{ label?: string }>(), { label: 'Carregando…' });
</script>

<template>
  <div class="loading" role="status" aria-live="polite">
    <span class="loading__spinner" aria-hidden="true" />
    <span class="loading__label">{{ label }}</span>
  </div>
</template>

<style scoped>
/* min-height propositalmente generoso: um spinner pequeno sozinho no meio de
   uma página que ficou vazia (ex.: trocando de aba no painel administrativo,
   onde cada view refaz o fetch do zero) lia como "tela em branco/quebrada"
   em vez de "carregando" — ocupar um espaço vertical previsível, com o
   spinner maior e centralizado, deixa claro que algo está de fato
   acontecendo ali, mesmo numa rede mais lenta que o localhost. */
.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  min-height: 240px;
  padding: var(--space-8) var(--space-4);
  color: var(--color-ink-muted);
  opacity: 0;
  animation: loading-fade-in 0.35s var(--ease-premium) 0.15s forwards;
}

.loading__spinner {
  width: 34px;
  height: 34px;
  border: 3px solid var(--color-rose-100);
  border-top-color: var(--color-rose-700);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.loading__label {
  font-size: 0.9rem;
  font-weight: 600;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes loading-fade-in {
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .loading {
    opacity: 1;
    animation: none;
  }
}
</style>
