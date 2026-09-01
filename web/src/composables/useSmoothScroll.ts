import { gsap, ScrollSmoother, ScrollTrigger, prefersReducedMotion } from '@/lib/motion';

// ScrollSmoother precisa da estrutura #smooth-wrapper > #smooth-content já
// presente no DOM (ver App.vue) — ele mesmo aplica via JS todo o CSS
// necessário (position:fixed no wrapper etc.) no momento do create(), então
// não há nada especial a declarar em CSS: se o create() nunca rodar (ex.:
// prefers-reduced-motion, ou SSR), os dois divs continuam blocos comuns e a
// página rola de forma nativa, sem nenhuma diferença visual ou de layout.
// smoothTouch é propositalmente baixo (quase desligado): a rolagem nativa em
// touch já é boa, e suavizar demais nela costuma parecer "borrachudo".
let smoother: ScrollSmoother | null = null;

export function initSmoothScroll(): ScrollSmoother | null {
  if (smoother || typeof window === 'undefined') return smoother;
  if (prefersReducedMotion()) return null;

  const wrapper = document.querySelector('#smooth-wrapper');
  const content = document.querySelector('#smooth-content');
  if (!wrapper || !content) return null;

  smoother = ScrollSmoother.create({
    wrapper: '#smooth-wrapper',
    content: '#smooth-content',
    smooth: 1.2,
    smoothTouch: 0.1,
    normalizeScroll: true,
    ignoreMobileResize: true,
  });

  return smoother;
}

export function getSmoother(): ScrollSmoother | null {
  return smoother;
}

// Chamado após trocas de rota / conteúdo assíncrono: a altura da página muda
// e o ScrollSmoother (assim como qualquer ScrollTrigger) precisa recalcular
// os limites de scroll, ou os gatilhos de animação ficam com posições stale.
export function refreshScroll() {
  ScrollTrigger.refresh();
}

export function resetScrollTop() {
  const s = getSmoother();
  if (s) {
    s.scrollTo(0, false);
  } else {
    window.scrollTo(0, 0);
  }
}

// Usado pelo botão "voltar ao topo" do rodapé: diferente de resetScrollTop
// (instantâneo, para troca de rota), este anima a subida. Com ScrollSmoother
// ativo, smoother.scrollTo(0, true) já faz isso suavemente sozinho; sem ele
// (prefers-reduced-motion ou init que falhou), cai para o scroll nativo do
// navegador, que também aceita behavior:'smooth'.
// Usado pelos chips de navegação rápida por categoria (ex.: página de
// Serviços): com ScrollSmoother ativo, um scrollIntoView nativo é ignorado
// (o smoother controla a posição real via transform, não scrollTop), então
// precisa passar pelo smoother.scrollTo quando ele existe.
export function scrollToElement(target: Element | string) {
  const s = getSmoother();
  if (s) {
    s.scrollTo(target, !prefersReducedMotion(), 'top 96px');
    return;
  }
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  el?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
}

export function scrollToTopAnimated() {
  const s = getSmoother();
  if (s) {
    s.scrollTo(0, true);
    return;
  }
  if (prefersReducedMotion()) {
    window.scrollTo(0, 0);
    return;
  }
  // Sem ScrollSmoother ativo, ainda assim evitamos o scroll nativo cru: uma
  // tween do GSAP (ScrollToPlugin, registrado em lib/motion.ts) com a mesma
  // curva de easing autoral do site mantém a sensação consistente com o
  // resto das animações, em vez de um scroll-behavior:smooth genérico do
  // navegador.
  gsap.to(window, { duration: 1, scrollTo: { y: 0 }, ease: 'premium-out' });
}
