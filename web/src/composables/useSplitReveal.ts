import { onMounted, onUnmounted } from 'vue';
import { gsap, SplitText, prefersReducedMotion } from '@/lib/motion';

// Revelação "cortina": cada linha de texto nasce dentro de uma máscara
// (overflow hidden) e sobe de baixo para cima — o efeito de título clássico
// de site premium/Awwwards. `mask:'lines'` (SplitText 3.13+) já cria esse
// wrapper por linha sozinho, então não precisamos de nenhum CSS extra: sem
// JS (ou com prefers-reduced-motion), o texto continua um <h2> normal,
// inteiro e selecionável, sem nenhum estado "escondido" dependente de script
// rodar com sucesso.
export function applySplitHeadingReveal(selector: string) {
  if (prefersReducedMotion()) return;

  const targets = document.querySelectorAll<HTMLElement>(selector);
  targets.forEach((el) => {
    SplitText.create(el, {
      type: 'lines',
      mask: 'lines',
      autoSplit: true,
      linesClass: 'split-line',
      onSplit(self) {
        return gsap.from(self.lines, {
          yPercent: 110,
          opacity: 0,
          duration: 1,
          stagger: 0.09,
          ease: 'premium-out',
          scrollTrigger: { trigger: el, start: 'top 85%' },
        });
      },
    });
  });
}

export function useSplitHeadingReveal(selector: string) {
  onMounted(() => {
    applySplitHeadingReveal(selector);
  });
}

// Título do hero: cada palavra entra com um leve giro 3D, dentro de uma
// máscara por linha (evita que o texto "vaze" da caixa enquanto gira/sobe
// antes da animação terminar, e resolve sozinho o problema de quebra de
// linha em telas estreitas que antes exigia controlar isso manualmente
// palavra por palavra no template).
export function splitHeroTitle(el: HTMLElement): () => void {
  if (prefersReducedMotion()) return () => {};

  let splitInstance: ReturnType<typeof SplitText.create> | null = null;

  splitInstance = SplitText.create(el, {
    type: 'words, lines',
    mask: 'lines',
    autoSplit: true,
    onSplit(self) {
      return gsap.from(self.words, {
        opacity: 0,
        yPercent: 130,
        rotateX: -50,
        transformOrigin: '50% 100%',
        duration: 1.1,
        stagger: 0.07,
        ease: 'premium-out',
      });
    },
  });

  return () => splitInstance?.revert();
}
