<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { gsap, Observer, prefersReducedMotion } from '@/lib/motion';

const props = withDefaults(defineProps<{ items?: string[]; durationSeconds?: number }>(), {
  items: () => ['Estética', 'Micropigmentação', 'Agendamento online', 'Camaçari · Bahia'],
  durationSeconds: 24,
});

// A segunda cópia do conteúdo só existe para fechar o loop infinito do
// scroll (translateX(-50%) para exatamente uma repetição). Com
// prefers-reduced-motion, a animação para e mostrar as duas cópias lado a
// lado ficaria estranho (texto repetido parado) — nesse caso, uma só basta.
const reduced = prefersReducedMotion();
const groupCount = reduced ? 1 : 2;

const track = ref<HTMLElement | null>(null);
let tween: gsap.core.Tween | null = null;
let observer: Observer | null = null;

onMounted(() => {
  if (reduced || !track.value) return;

  // Timeline própria em vez do @keyframes CSS anterior: assim conseguimos
  // acelerar/inverter o loop em tempo real (timeScale) conforme a
  // velocidade e direção do scroll do visitante — um pequeno toque de
  // "rolodex" que só é possível controlando a animação via JS.
  tween = gsap.to(track.value, {
    xPercent: -50,
    duration: props.durationSeconds,
    ease: 'none',
    repeat: -1,
  });

  observer = Observer.create({
    target: window,
    type: 'wheel,touch,pointer',
    onChangeY: (self) => {
      if (!tween) return;
      const boost = gsap.utils.clamp(-4, 4, self.deltaY / 60);
      gsap.to(tween, { timeScale: 1 + boost, duration: 0.3, overwrite: true });
      gsap.to(tween, { timeScale: 1, duration: 1.2, delay: 0.35, overwrite: 'auto' });
    },
  });
});

onUnmounted(() => {
  tween?.kill();
  observer?.kill();
});
</script>

<template>
  <div class="marquee" aria-hidden="true">
    <div ref="track" class="marquee__track">
      <span v-for="group in groupCount" :key="group" class="marquee__group">
        <span v-for="(item, i) in items" :key="i" class="marquee__item">
          {{ item }}
          <span class="marquee__dot">✦</span>
        </span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.marquee {
  overflow: hidden;
  background: var(--color-rose-100);
  border-block: 1px solid var(--color-border);
  padding-block: var(--space-4);
  /* Esmaece o texto nas bordas em vez de cortar abruptamente — sem isso, as
     palavras que cruzam o limite do contêiner terminam "decapitadas". */
  mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
}

.marquee__track {
  display: flex;
  width: max-content;
  /* Sem @keyframes aqui de propósito: o GSAP assume 100% desta animação (ver
     onMounted) porque precisa poder variar a velocidade em tempo real
     (Observer). Uma CSS animation rodando ao mesmo tempo na mesma
     propriedade (transform) venceria a inline style do GSAP a cada frame —
     as duas nunca poderiam coexistir de forma previsível. Sem JS (ou com
     prefers-reduced-motion, onde groupCount já vira 1), o track fica só
     parado no lugar — degradação aceitável, mesma lógica já usada em todo o
     resto do site quando prefers-reduced-motion está ativo. */
}

.marquee__group {
  display: flex;
  flex-shrink: 0;
}

.marquee__item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  padding-inline: var(--space-4);
  font-family: var(--font-display);
  font-size: clamp(1.2rem, 2.6vw, 1.7rem);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-rose-900);
  white-space: nowrap;
}

.marquee__dot {
  color: var(--color-rose-500);
  font-size: 0.9rem;
}
</style>
