import { onMounted, onUnmounted } from 'vue';
import { gsap, prefersReducedMotion, supportsFinePointer } from '@/lib/motion';

// Leve inclinação 3D que segue o cursor, só em dispositivos com mouse de
// verdade — `(hover: hover) and (pointer: fine)` já exclui touch sozinho,
// então nem precisa checar userAgent. Sai de cena com prefers-reduced-motion.
// Exportada como função standalone (igual ao padrão de applyStaggerReveal)
// porque grades alimentadas por dado assíncrono só existem no DOM depois
// que o v-if libera — chamar isso do onMounted do componente não encontra
// nada nesse caso. Retorna uma função de limpeza (remova os listeners ao
// desmontar ou antes de reaplicar em uma lista que mudou).
export function applyTiltHover(containerSelector: string, itemSelector: string, maxDeg = 8): () => void {
  if (!supportsFinePointer() || prefersReducedMotion()) return () => {};

  const container = document.querySelector(containerSelector);
  if (!container) return () => {};

  const cleanupFns: Array<() => void> = [];
  const items = container.querySelectorAll<HTMLElement>(itemSelector);

  items.forEach((el) => {
    el.style.transformStyle = 'preserve-3d';

    // GSAP passa a "dono" do transform inline deste elemento assim que toca
    // nele — um estilo inline sempre vence uma regra de CSS, então qualquer
    // transform de :hover no stylesheet (ex.: translateY de destaque) pararia
    // de funcionar. Por isso o "levantar" no hover é feito aqui via scale,
    // junto com a inclinação, em vez de deixado para o CSS.
    const onMove = (event: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      gsap.to(el, {
        rotateX: -py * maxDeg,
        rotateY: px * maxDeg,
        scale: 1.035,
        transformPerspective: 700,
        duration: 0.4,
        ease: 'power2.out',
        overwrite: true,
      });
    };

    const onLeave = () => {
      gsap.to(el, { rotateX: 0, rotateY: 0, scale: 1, duration: 0.5, ease: 'power2.out', overwrite: true });
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

// Versão para conteúdo já presente no DOM na primeira renderização.
export function useTiltHover(containerSelector: string, itemSelector: string, maxDeg = 8) {
  let cleanup: () => void = () => {};

  onMounted(() => {
    cleanup = applyTiltHover(containerSelector, itemSelector, maxDeg);
  });

  onUnmounted(() => {
    cleanup();
  });
}
