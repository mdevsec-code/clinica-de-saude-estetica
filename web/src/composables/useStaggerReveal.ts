import { onMounted, onUnmounted } from 'vue';
import { gsap, ScrollTrigger, prefersReducedMotion } from '@/lib/motion';

// Reveal em grupo para grades/listas de cards. ScrollTrigger.batch em vez de
// um único gatilho no container: numa lista longa (o catálogo de serviços,
// por exemplo), um gatilho só animava TODOS os itens de uma vez assim que o
// topo da lista aparecia — os de baixo terminavam de animar fora da tela,
// sem ninguém ver. Com batch, cada leva de itens que entra junto na tela
// anima junta, em sequência, fileira por fileira conforme a rolagem.
// Exportada como função standalone (além do composable abaixo) porque grades
// alimentadas por dado assíncrono (ex.: categorias vindas da API) só existem
// no DOM depois que o v-if libera — nesses casos, chame applyStaggerReveal
// manualmente depois de um `nextTick()` logo após os dados chegarem.
export function applyStaggerReveal(containerSelector: string, itemSelector: string): ScrollTrigger[] {
  const container = document.querySelector(containerSelector);
  if (!container) return [];
  const items = container.querySelectorAll<HTMLElement>(itemSelector);
  if (!items.length) return [];

  if (prefersReducedMotion()) {
    items.forEach((el) => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
    return [];
  }

  gsap.set(items, { opacity: 0, y: 48, scale: 0.97 });

  return ScrollTrigger.batch(items, {
    start: 'top 90%',
    once: true,
    onEnter: (batch) =>
      gsap.to(batch, {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 1,
        stagger: { each: 0.07, from: 'start' },
        ease: 'premium-out',
        // Devolve o transform ao CSS ao terminar: o :hover dos cards (e o
        // tilt do useTiltHover) não brigam com um transform inline residual.
        clearProps: 'transform',
      }),
  });
}

// Revelação de FOTO: a imagem nasce recortada (clip-path) e encolhida, e se
// abre como uma janela enquanto a escala volta ao normal — mais próprio de
// uma foto do que o fade-subindo genérico. Usado nos cards com foto de
// categoria. clearProps ao final libera o clip-path: o selo "Destaque" fica
// propositalmente para fora da borda do card e seria cortado por ele.
export function applyPhotoReveal(containerSelector: string, itemSelector: string): ScrollTrigger[] {
  const container = document.querySelector(containerSelector);
  if (!container) return [];
  const items = container.querySelectorAll<HTMLElement>(itemSelector);
  if (!items.length) return [];

  if (prefersReducedMotion()) {
    items.forEach((el) => {
      el.style.opacity = '1';
    });
    return [];
  }

  gsap.set(items, { clipPath: 'inset(18% 10% 18% 10% round 28px)', opacity: 0, scale: 1.06 });

  return ScrollTrigger.batch(items, {
    start: 'top 88%',
    once: true,
    onEnter: (batch) =>
      gsap.to(batch, {
        clipPath: 'inset(0% 0% 0% 0% round 16px)',
        opacity: 1,
        scale: 1,
        duration: 1.3,
        stagger: 0.09,
        ease: 'premium-out',
        clearProps: 'clipPath,transform',
      }),
  });
}

// Versão para conteúdo já presente no DOM na primeira renderização (listas
// estáticas). Para conteúdo assíncrono, use applyStaggerReveal diretamente.
export function useStaggerReveal(containerSelector: string, itemSelector: string) {
  let triggers: ScrollTrigger[] = [];

  onMounted(() => {
    triggers = applyStaggerReveal(containerSelector, itemSelector);
  });

  onUnmounted(() => {
    triggers.forEach((t) => t.kill());
    triggers = [];
  });
}
