import { onMounted, onUnmounted } from 'vue';
import { gsap, ScrollTrigger, prefersReducedMotion } from '@/lib/motion';

// Aplica um reveal sutil (fade + leve subida) a cada elemento com o seletor
// dado, disparado por scroll. Existe para dar a sensação de qualidade pedida
// no escopo sem virar "demonstração de efeitos" — é a mesma animação simples
// reaproveitada em toda a home. Desliga sozinho quando o usuário pede menos
// movimento (prefers-reduced-motion).
// Standalone (mesmo padrão de applyStaggerReveal/applyTiltHover/etc.):
// seções que só existem no DOM depois de um fetch assíncrono (ex.: o bloco
// de destaque do carro-chefe na Home, condicionado a featuredCategory) não
// existem ainda quando um onMounted no topo do componente rodaria — chamar
// isso synchronously no setup encontraria zero elementos [data-reveal]
// dentro delas e elas ficariam com opacity:0 (regra global) para sempre,
// já que essa varredura só acontece uma vez. Nesses casos, chame
// applyScrollReveal manualmente depois de um nextTick(), como já é feito
// para os cards de especialidade.
export function applyScrollReveal(containerSelector: string, itemSelector = '[data-reveal]'): ScrollTrigger[] {
  const container = document.querySelector(containerSelector);
  if (!container) return [];

  const items = container.querySelectorAll<HTMLElement>(itemSelector);
  if (prefersReducedMotion()) {
    items.forEach((el) => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
    return [];
  }

  const triggers: ScrollTrigger[] = [];
  items.forEach((el) => {
    const tween = gsap.fromTo(
      el,
      { opacity: 0, y: 24 },
      {
        opacity: 1,
        y: 0,
        duration: 0.9,
        ease: 'premium-out',
        scrollTrigger: { trigger: el, start: 'top 88%' },
      },
    );
    if (tween.scrollTrigger) triggers.push(tween.scrollTrigger);
  });
  return triggers;
}

// Versão para conteúdo já presente no DOM na primeira renderização. Para
// conteúdo assíncrono, use applyScrollReveal diretamente.
export function useScrollReveal(containerSelector: string, itemSelector = '[data-reveal]') {
  let triggers: ScrollTrigger[] = [];

  onMounted(() => {
    triggers = applyScrollReveal(containerSelector, itemSelector);
  });

  onUnmounted(() => {
    triggers.forEach((t) => t.kill());
    triggers = [];
  });
}
