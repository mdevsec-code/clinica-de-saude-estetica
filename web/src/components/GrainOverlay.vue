<script setup lang="ts">
// Textura de grão bem sutil por cima de TUDO — precisa ser o ÚLTIMO elemento
// renderizado em App.vue para pintar por cima do header/main/footer em
// ordem normal do DOM. mix-blend-mode + opacidade baixa: dá uma sensação
// tátil/editorial ao site sem nunca atrapalhar a leitura do conteúdo.
</script>

<template>
  <div class="grain" aria-hidden="true" />
</template>

<style scoped>
.grain {
  position: fixed;
  inset: 0;
  /* Precisa ficar acima de tudo, inclusive elementos com z-index explícito
     (header=40, botão flutuante do WhatsApp=50) — sem isso, por regra de
     stacking context, um z-index:auto não vence um z-index explícito só por
     vir depois no DOM. */
  z-index: 100;
  pointer-events: none;
  opacity: 0.05;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
</style>
