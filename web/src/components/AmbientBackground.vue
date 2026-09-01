<script setup lang="ts">
// Blobs de cor à deriva atrás de todo o conteúdo. Precisa ser o PRIMEIRO
// elemento renderizado em App.vue (antes do header/main/footer): sendo
// position:fixed, isso não afeta o layout, mas garante que ele pinte
// ATRÁS do resto do site em ordem normal de pintura do DOM, sem precisar
// de truques de z-index negativo (que ficariam escondidos atrás do próprio
// fundo opaco do body). Pausa sozinho com prefers-reduced-motion.
</script>

<template>
  <div class="ambient" aria-hidden="true">
    <span class="ambient__blob ambient__blob--1" />
    <span class="ambient__blob ambient__blob--2" />
    <span class="ambient__blob ambient__blob--3" />
  </div>
</template>

<style scoped>
.ambient {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.ambient__blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(70px);
  opacity: 0.35;
  will-change: transform;
}

.ambient__blob--1 {
  width: 42vw;
  height: 42vw;
  max-width: 560px;
  max-height: 560px;
  top: -12vw;
  left: -10vw;
  background: radial-gradient(circle, var(--color-rose-300), transparent 70%);
  animation: drift-1 26s ease-in-out infinite;
}

.ambient__blob--2 {
  width: 36vw;
  height: 36vw;
  max-width: 480px;
  max-height: 480px;
  top: 40vh;
  right: -12vw;
  background: radial-gradient(circle, var(--color-rose-100), transparent 70%);
  animation: drift-2 32s ease-in-out infinite;
}

.ambient__blob--3 {
  width: 30vw;
  height: 30vw;
  max-width: 420px;
  max-height: 420px;
  bottom: -10vw;
  left: 20vw;
  background: radial-gradient(circle, var(--color-rose-500), transparent 70%);
  opacity: 0.2;
  animation: drift-3 38s ease-in-out infinite;
}

@keyframes drift-1 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(6vw, 5vh) scale(1.12); }
}

@keyframes drift-2 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(-5vw, 6vh) scale(1.08); }
}

@keyframes drift-3 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(4vw, -4vh) scale(1.15); }
}

@media (prefers-reduced-motion: reduce) {
  .ambient__blob {
    animation: none;
  }
}
</style>
