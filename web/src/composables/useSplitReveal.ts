import { onMounted, onUnmounted } from 'vue';
import { gsap, SplitText, prefersReducedMotion } from '@/lib/motion';

// Revelação "cortina" de títulos: cada linha vira uma máscara (overflow
// hidden, criada pelo próprio SplitText via mask:'lines') e as PALAVRAS
// sobem de dentro dela em sequência, com uma leve rotação que assenta no
// lugar — lê como tinta assentando no papel, não como bloco deslizando.
// autoSplit:true é essencial com a fonte web: a Fraunces carrega depois do
// primeiro render, e as quebras de linha mudam quando ela chega — sem
// autoSplit, as máscaras ficavam calculadas com a fonte de fallback e
// cortavam o texto. Sem JS (ou com prefers-reduced-motion), o título
// continua um <h2> normal, inteiro e selecionável.
//
// As máscaras cortavam o que desce abaixo da linha (a cedilha de "serviços",
// o g, p, j): por isso cada máscara ganha folga embaixo (padding compensado
// por margin negativa — a linha não muda de lugar) e, quando a animação
// termina, o split é desfeito: o título volta a ser texto normal, inteiro.
// Retorna a função de limpeza (reverte o split e mata os gatilhos) — quem
// chama de dentro de useGsapContext não precisa dela, o contexto já reverte.
type SplitSelf = { masks?: Element[]; revert: () => void };

export function giveMasksRoom(self: SplitSelf) {
  self.masks?.forEach((mask) => {
    const el = mask as HTMLElement;
    el.style.paddingBottom = '0.22em';
    el.style.marginBottom = '-0.22em';
  });
}

export function applySplitHeadingReveal(selector: string): () => void {
  if (prefersReducedMotion()) return () => {};

  const targets = document.querySelectorAll<HTMLElement>(selector);
  const splits = Array.from(targets).map((el) =>
    SplitText.create(el, {
      type: 'words, lines',
      mask: 'lines',
      autoSplit: true,
      linesClass: 'split-line',
      onSplit(self) {
        giveMasksRoom(self);
        return gsap.from(self.words, {
          onComplete: () => self.revert(),
          yPercent: 115,
          rotate: 4,
          transformOrigin: '0% 100%',
          duration: 1.15,
          stagger: 0.045,
          ease: 'premium-out',
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        });
      },
    }),
  );

  return () => splits.forEach((s) => s.revert());
}

export function useSplitHeadingReveal(selector: string) {
  let cleanup: () => void = () => {};
  onMounted(() => {
    cleanup = applySplitHeadingReveal(selector);
  });
  onUnmounted(() => cleanup());
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
      // O elemento nasce com opacity:0 no CSS (ver .hero__title em
      // HomeView.vue) só pra não aparecer "pronto" por um instante antes do
      // split rodar. Assim que o split acontece (e as palavras já nascem
      // com opacity:0 individualmente, prontas pra animar), o pai pode
      // voltar a ficar visível — o conteúdo real continua escondido pelas
      // próprias palavras até a timeline abaixo revelar cada uma.
      gsap.set(el, { opacity: 1 });
      giveMasksRoom(self);
      return gsap.from(self.words, {
        onComplete: () => self.revert(),
        opacity: 0,
        yPercent: 130,
        rotateX: -60,
        rotate: 3,
        transformOrigin: '50% 100%',
        // Mais curto que antes (1.4s): o título é o que diz o que é a clínica,
        // precisa estar legível logo que a cortina sai.
        duration: 0.9,
        stagger: 0.06,
        ease: 'premium-out',
      });
    },
  });

  return () => splitInstance?.revert();
}
