<script setup lang="ts">
// Cortina de abertura: cobre a tela inteira no primeiro carregamento real da
// página (App.vue monta este componente uma única vez por sessão de SPA — ele
// nunca reaparece em trocas de rota), com o monograma da marca surgindo e
// dando lugar ao site com um wipe. Existe por dois motivos: (1) é a
// "apresentação" da marca que a Home merece no primeiro contato, em vez de um
// fade genérico; (2) de brinde, esconde qualquer instabilidade de layout dos
// primeiros instantes (fontes carregando, imagens do hero ainda chegando)
// atrás de uma superfície sólida em vez de deixar o usuário ver o reflow.
import { onMounted, onUnmounted, ref } from 'vue';
import { gsap, prefersReducedMotion } from '@/lib/motion';
import { markAppIntroReady } from '@/composables/useAppIntro';

const visible = ref(true);
const root = ref<HTMLElement | null>(null);
const mark = ref<HTMLElement | null>(null);

function unlockScroll() {
  document.documentElement.style.removeProperty('overflow');
}

onMounted(() => {
  if (prefersReducedMotion()) {
    visible.value = false;
    markAppIntroReady();
    return;
  }

  // Trava o scroll nativo enquanto a cortina cobre a tela — o
  // ScrollSmoother continua existindo por baixo, só não queremos que um
  // scroll físico do usuário "adiante" o conteúdo antes da revelação.
  document.documentElement.style.overflow = 'hidden';

  // Encurtada de propósito (era ~2s só a cortina, mais ~1.5s da entrada
  // própria do hero logo em seguida — quase 3.5s de "abertura" combinada).
  // Duas revelações completas e elaboradas em sequência pro MESMO conteúdo
  // (a cortina "revela" a página, e então o hero faz seu próprio wipe de
  // foto + fade de texto por cima) lia como a página carregando duas vezes,
  // não como uma entrada única e coesa. Agora é só um flash rápido de
  // marca — o hero (mais elaborado, com o wipe da foto e o título se
  // desenhando) é que fica sendo A entrada de verdade, não uma segunda.
  const tl = gsap.timeline({
    defaults: { ease: 'premium-out' },
    onComplete: () => {
      unlockScroll();
      visible.value = false;
      markAppIntroReady();
    },
  });

  tl.fromTo(mark.value, { opacity: 0, scale: 0.86, y: 8 }, { opacity: 1, scale: 1, y: 0, duration: 0.32 })
    .to(mark.value, { opacity: 0, scale: 1.04, duration: 0.22, ease: 'premium-in-out' }, '+=0.12')
    .to(root.value, { yPercent: -100, duration: 0.45, ease: 'premium-in-out' }, '<-0.05');
});

onUnmounted(unlockScroll);
</script>

<template>
  <div v-if="visible" ref="root" class="app-intro" aria-hidden="true">
    <img ref="mark" class="app-intro__logo" src="/brand/logo-noely-cerqueira.png" alt="" />
  </div>
</template>

<style scoped>
.app-intro {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--color-rose-700), var(--color-rose-900));
}

.app-intro__logo {
  /* clamp (não um height fixo) para o aumento não estourar a largura da
     tela em celulares estreitos: a logo é o lockup completo (monograma +
     nome), bem mais larga que alta. */
  height: clamp(100px, 26vw, 160px);
  width: auto;
  max-width: 82vw;
  /* Mesmo truque de brightness(0) invert(1) do logo do rodapé: vira o
     monograma inteiro branco para ler bem sobre o gradiente rosé escuro. */
  filter: brightness(0) invert(1);
  opacity: 0;
}
</style>
