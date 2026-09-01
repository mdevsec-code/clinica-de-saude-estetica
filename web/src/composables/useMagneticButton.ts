import { onMounted, onUnmounted } from 'vue';
import { gsap, prefersReducedMotion, supportsFinePointer } from '@/lib/motion';

// Botões "magnéticos": seguem o cursor com um deslocamento pequeno dentro da
// própria área (efeito clássico de site premium/agência). Usa gsap.quickTo
// (interpolador otimizado para updates de altíssima frequência como
// mousemove — muito mais barato que criar um gsap.to novo a cada evento).
// Standalone + wrapper, no mesmo padrão de applyTiltHover/applyStaggerReveal,
// porque botões dentro de conteúdo assíncrono (ex.: o CTA da seção
// "carro-chefe") só existem no DOM depois do fetch.
export function applyMagneticButtons(selector: string, strength = 0.35): () => void {
  if (!supportsFinePointer() || prefersReducedMotion()) return () => {};

  const buttons = document.querySelectorAll<HTMLElement>(selector);
  const cleanupFns: Array<() => void> = [];

  buttons.forEach((el) => {
    const xTo = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'premium-out' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'premium-out' });

    const onMove = (event: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      xTo((event.clientX - rect.left - rect.width / 2) * strength);
      yTo((event.clientY - rect.top - rect.height / 2) * strength);
    };

    const onLeave = () => {
      xTo(0);
      yTo(0);
    };

    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    cleanupFns.push(() => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    });
  });

  return () => cleanupFns.forEach((fn) => fn());
}

export function useMagneticButtons(selector: string, strength = 0.35) {
  let cleanup: () => void = () => {};

  onMounted(() => {
    cleanup = applyMagneticButtons(selector, strength);
  });

  onUnmounted(() => cleanup());
}
