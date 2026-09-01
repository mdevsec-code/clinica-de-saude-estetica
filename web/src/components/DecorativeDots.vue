<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { gsap, prefersReducedMotion } from '@/lib/motion';

withDefaults(defineProps<{ count?: number; tone?: 'rose' | 'light' }>(), { count: 10, tone: 'rose' });

const root = ref<HTMLElement | null>(null);
let tweens: gsap.core.Tween[] = [];

onMounted(() => {
  if (prefersReducedMotion() || !root.value) return;

  const dots = root.value.querySelectorAll<HTMLElement>('.dot');
  dots.forEach((dot, index) => {
    // Pequeno laço orgânico (curva bezier fechada) em vez de um simples
    // sobe-desce: motionPath faz o ponto "flutuar" com uma trajetória curva
    // e assimétrica, muito mais parecida com poeira/pétalas no ar do que um
    // yoyo linear em um único eixo.
    const spread = 10 + Math.random() * 16;
    const duration = 7 + Math.random() * 5;
    const tween = gsap.to(dot, {
      motionPath: {
        path: [
          { x: 0, y: 0 },
          { x: spread, y: -spread * 0.6 },
          { x: spread * 0.3, y: -spread * 1.3 },
          { x: -spread * 0.6, y: -spread * 0.4 },
          { x: 0, y: 0 },
        ],
        curviness: 1.6,
      },
      duration,
      delay: index * 0.2,
      ease: 'sine.inOut',
      repeat: -1,
    });
    tweens.push(tween);
  });
});

onUnmounted(() => {
  tweens.forEach((t) => t.kill());
  tweens = [];
});
</script>

<template>
  <div ref="root" class="dots" :class="`dots--${tone}`" aria-hidden="true">
    <span v-for="i in count" :key="i" class="dot" :style="{
      left: `${(i * 37) % 100}%`,
      top: `${(i * 53) % 100}%`,
      width: `${4 + (i % 3) * 3}px`,
      height: `${4 + (i % 3) * 3}px`,
    }" />
  </div>
</template>

<style scoped>
.dots {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.dot {
  position: absolute;
  border-radius: 50%;
  background: var(--color-rose-500);
  opacity: 0.35;
}

.dots--light .dot {
  background: #fff;
  opacity: 0.5;
}
</style>
