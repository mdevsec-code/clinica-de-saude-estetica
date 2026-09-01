import { onMounted, onUnmounted } from 'vue';
import { prefersReducedMotion, supportsFinePointer } from '@/lib/motion';

// Holofote que segue o cursor dentro do card (usado em specialty-card,
// differential, featured etc.) — atualiza duas custom properties CSS
// (--spot-x/--spot-y) lidas por um radial-gradient no ::before do card (ver
// CSS de cada componente). Escrever direto em style.setProperty é mais
// barato que uma tween do GSAP aqui: não há "animação" real acontecendo,
// só leitura de posição do mouse a cada frame de mousemove.
export function applySpotlightHover(containerSelector: string, itemSelector: string): () => void {
  if (!supportsFinePointer() || prefersReducedMotion()) return () => {};

  const container = document.querySelector(containerSelector);
  if (!container) return () => {};

  const cleanupFns: Array<() => void> = [];
  const items = container.querySelectorAll<HTMLElement>(itemSelector);

  items.forEach((el) => {
    const onMove = (event: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      el.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
      el.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
    };
    const onEnter = () => el.classList.add('is-spotlit');
    const onLeave = () => el.classList.remove('is-spotlit');

    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onLeave);
    cleanupFns.push(() => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mouseleave', onLeave);
    });
  });

  return () => cleanupFns.forEach((fn) => fn());
}

export function useSpotlightHover(containerSelector: string, itemSelector: string) {
  let cleanup: () => void = () => {};

  onMounted(() => {
    cleanup = applySpotlightHover(containerSelector, itemSelector);
  });

  onUnmounted(() => cleanup());
}
