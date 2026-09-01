<script setup lang="ts">
// Divisor orgânico entre seções (em vez de uma borda reta), ecoando o
// respingo/anel do monograma da marca. `fill` recebe a cor de fundo da
// seção que vem A SEGUIR (o divisor "derrete" para dentro dela); `bgBefore`
// preenche o resto da caixa do divisor com a cor da seção ANTERIOR — sem
// isso, a área acima da onda ficaria transparente e mostraria o que estiver
// atrás (o fundo ambiente), em vez de continuar a cor de quem veio antes.
import { onMounted, ref } from 'vue';
import { gsap, prefersReducedMotion } from '@/lib/motion';

const props = withDefaults(defineProps<{ fill?: string; bgBefore?: string; flip?: boolean }>(), {
  fill: 'var(--color-bg)',
  bgBefore: 'var(--color-bg)',
  flip: false,
});

const accent = ref<SVGPathElement | null>(null);

onMounted(() => {
  if (!accent.value || prefersReducedMotion()) return;
  // Traço de assinatura que "se desenha" sobre a onda ao entrar na tela —
  // usa o plugin DrawSVG (registrado em lib/motion.ts) para animar
  // stroke-dashoffset sem precisar calcular o comprimento do path na mão.
  gsap.set(accent.value, { drawSVG: '0%' });
  gsap.to(accent.value, {
    drawSVG: '100%',
    duration: 1.4,
    ease: 'power2.inOut',
    scrollTrigger: { trigger: accent.value, start: 'top 92%' },
  });
});
</script>

<template>
  <div class="divider" :class="{ 'divider--flip': props.flip }" aria-hidden="true">
    <svg viewBox="0 0 1440 100" preserveAspectRatio="none">
      <path class="divider__path" d="M0,38 C320,92 1120,-14 1440,42 L1440,100 L0,100 Z" />
      <path ref="accent" class="divider__accent" d="M0,38 C320,92 1120,-14 1440,42" />
    </svg>
  </div>
</template>

<style scoped>
.divider {
  line-height: 0;
  position: relative;
  z-index: 1;
  background: v-bind(bgBefore);
  /* Sobrepõe a seção seguinte em 1px (que já começa exatamente na mesma cor
     `fill` da base da onda): sem isso, dependendo do zoom/DPI do navegador,
     o arredondamento de subpixel na borda inferior do SVG às vezes deixa uma
     linha de 1px do bgBefore (a cor de ANTES da onda) vazando entre este
     divisor e a seção seguinte — visualmente lê como uma costura cortando o
     que devia ser um degradê contínuo. */
  margin-bottom: -1px;
}

.divider svg {
  display: block;
  width: 100%;
  height: 56px;
  overflow: visible;
}

.divider__path {
  fill: v-bind(fill);
}

.divider__accent {
  /* Cor fixa (não v-bind(fill)) de propósito: o traço fica POR CIMA da onda,
     que já é preenchida com a cor `fill` — um traço da mesma cor do
     preenchimento ficaria invisível. Um rosé claro constante lê bem tanto
     sobre fundos claros quanto sobre a seção escura. */
  fill: none;
  stroke: var(--color-rose-300);
  stroke-width: 2;
  stroke-linecap: round;
  opacity: 0.7;
}

.divider--flip {
  transform: scaleY(-1);
}

@media (min-width: 900px) {
  .divider svg {
    height: 84px;
  }
}
</style>
