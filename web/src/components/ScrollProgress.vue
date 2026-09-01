<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { gsap, ScrollTrigger } from '@/lib/motion';

// Barra fina no topo mostrando o progresso de leitura da página inteira —
// atualizada via ScrollTrigger (que já entende a rolagem "virtual" do
// ScrollSmoother, então funciona igual com ou sem ele ativo).
const bar = ref<HTMLElement | null>(null);
let trigger: ScrollTrigger | null = null;

onMounted(() => {
  if (!bar.value) return;
  trigger = ScrollTrigger.create({
    start: 0,
    end: () => document.documentElement.scrollHeight - window.innerHeight,
    onUpdate: (self) => {
      gsap.set(bar.value, { scaleX: self.progress });
    },
  });
});

onUnmounted(() => {
  trigger?.kill();
  trigger = null;
});
</script>

<template>
  <div class="scroll-progress" aria-hidden="true">
    <div ref="bar" class="scroll-progress__bar" />
  </div>
</template>

<style scoped>
.scroll-progress {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 60;
  background: transparent;
  pointer-events: none;
}

.scroll-progress__bar {
  height: 100%;
  width: 100%;
  transform-origin: left center;
  transform: scaleX(0);
  background: linear-gradient(90deg, var(--color-rose-500), var(--color-rose-900));
}
</style>
