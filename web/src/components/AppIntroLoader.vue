<script setup lang="ts">
// Cortina de abertura: cobre a tela inteira no primeiro carregamento real da
// página, com o monograma da marca surgindo e dando lugar ao site com um
// wipe. Existe por dois motivos: (1) é a "apresentação" da marca que a Home
// merece no primeiro contato, em vez de um fade genérico; (2) de brinde,
// esconde qualquer instabilidade de layout dos primeiros instantes (fontes
// carregando, imagens do hero ainda chegando) atrás de uma superfície sólida
// em vez de deixar o usuário ver o reflow.
//
// "Uma vez por sessão" precisa ser sessionStorage, não só um estado do
// componente: um F5/recarregamento cria uma sessão de JS inteiramente nova
// (o módulo é reavaliado do zero), então uma flag em memória nunca
// sobreviveria de um reload pro outro — a cortina reaparecia (com o conteúdo
// de trás ainda travado, dado que rotas são lazy-loaded) em TODO reload, não
// só na primeira visita de verdade. sessionStorage sobrevive a reloads da
// mesma aba e some ao fechá-la — exatamente "uma vez por sessão de
// navegador", que era a intenção original.
import { onMounted, onUnmounted, ref } from 'vue';
import { gsap, prefersReducedMotion } from '@/lib/motion';
import { markAppIntroReady } from '@/composables/useAppIntro';

const INTRO_SESSION_KEY = 'noely_intro_shown';

const visible = ref(true);
const root = ref<HTMLElement | null>(null);
const mark = ref<HTMLElement | null>(null);

function unlockScroll() {
  document.documentElement.style.removeProperty('overflow');
}

function alreadyShownThisSession(): boolean {
  try {
    return sessionStorage.getItem(INTRO_SESSION_KEY) === '1';
  } catch {
    // Navegação privada em alguns navegadores pode bloquear sessionStorage —
    // nesse caso a cortina volta a tocar em todo reload (degrada pro
    // comportamento antigo em vez de quebrar a página).
    return false;
  }
}

onMounted(() => {
  // Reforço do scrollTo(0,0) já feito o mais cedo possível em index.html —
  // cobre a janela entre aquele script e este ponto (ex.: reflow por fontes
  // carregando), onde o navegador ainda poderia reimpor uma posição de
  // rolagem antiga por baixo da cortina antes dela revelar a página.
  window.scrollTo(0, 0);

  if (prefersReducedMotion() || alreadyShownThisSession()) {
    visible.value = false;
    markAppIntroReady();
    return;
  }
  try {
    sessionStorage.setItem(INTRO_SESSION_KEY, '1');
  } catch {
    // Sem sessionStorage disponível — segue exibindo a cortina desta vez
    // (ver alreadyShownThisSession acima), só não persiste pra próxima.
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
