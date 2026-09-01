import { onMounted, onUnmounted } from 'vue';
import { gsap, ScrollTrigger, prefersReducedMotion } from '@/lib/motion';

// Reveal em grupo (um único gatilho de scroll anima todos os itens em stagger),
// para grades de cards — dá uma entrada mais coesa do que revelar item a item.
// Exportada como função standalone (além do composable abaixo) porque grades
// alimentadas por dado assíncrono (ex.: categorias vindas da API) só existem
// no DOM depois que o v-if libera — chamar isso direto do onMounted do
// componente não adianta, porque os itens ainda não existem nesse momento.
// Nesses casos, chame applyStaggerReveal manualmente depois de um `nextTick()`
// logo após os dados chegarem.
export function applyStaggerReveal(containerSelector: string, itemSelector: string): ScrollTrigger | null {
  const container = document.querySelector(containerSelector);
  if (!container) return null;
  const items = container.querySelectorAll<HTMLElement>(itemSelector);
  if (!items.length) return null;

  if (prefersReducedMotion()) {
    items.forEach((el) => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
    return null;
  }

  const tween = gsap.fromTo(
    items,
    { opacity: 0, y: 40, scale: 0.94, rotateX: -8 },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      rotateX: 0,
      duration: 0.7,
      stagger: 0.08,
      ease: 'back.out(1.5)',
      transformPerspective: 800,
      scrollTrigger: { trigger: container, start: 'top 85%' },
    },
  );
  return tween.scrollTrigger ?? null;
}

// Versão para conteúdo já presente no DOM na primeira renderização (listas
// estáticas). Para conteúdo assíncrono, use applyStaggerReveal diretamente.
export function useStaggerReveal(containerSelector: string, itemSelector: string) {
  let trigger: ScrollTrigger | null = null;

  onMounted(() => {
    trigger = applyStaggerReveal(containerSelector, itemSelector);
  });

  onUnmounted(() => {
    trigger?.kill();
    trigger = null;
  });
}
