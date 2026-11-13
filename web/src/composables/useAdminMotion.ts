import { gsap, prefersReducedMotion, SplitText, supportsFinePointer } from '@/lib/motion';
import { giveMasksRoom } from '@/composables/useSplitReveal';

// Movimento "de fábrica" do painel inteiro, sem cada tela precisar pedir:
//   1. Revelação: todo cartão (.admin-card, .kpi-card…) que aparece na tela
//      sobe e assenta — na carga, ao chegar dados, ao trocar de filtro, e os
//      de baixo só quando a rolagem chega neles.
//   2. Brilho que segue o mouse: uma luz champagne suave acompanha o ponteiro
//      dentro do cartão (só em cartões de fundo liso, para não apagar os
//      degradês dos cartões de destaque).
//   3. Título da aba: a cada troca de aba, o <h1> sobe palavra por palavra.
// Tudo com transform/opacity (GPU), sem blur, e desligado com
// prefers-reduced-motion.

// .kpi-card fica de fora: o Painel já tem a entrada própria dos KPIs (com a
// contagem dos números) — animar de novo daqui disputava o mesmo elemento e
// deixava cartões meio apagados. Telas com movimento próprio podem marcar
// um container com [data-own-motion] para ficar fora da revelação.
export const CARD_SELECTOR = [
  '.admin-card',
  '.schedule__card',
  '.admin-catalog__stat',
  '.admin-finance__stat',
  '.admin-users__card',
  '[data-reveal]',
].join(',');

export function installAdminMotion(root: HTMLElement) {
  if (prefersReducedMotion()) return () => {};

  // --- 1. Revelação ------------------------------------------------------
  const seen = new WeakSet<Element>();
  let batch: HTMLElement[] = [];
  let scheduled = false;

  const flush = () => {
    scheduled = false;
    // Quem já está sendo animado por outra coisa (v-stagger, a própria
    // tela) fica de fora — nada de animar duas vezes.
    const items = batch.filter((el) => el.isConnected && !gsap.isTweening(el));
    batch = [];
    if (!items.length) return;
    gsap.fromTo(
      items,
      { opacity: 0, y: 26, scale: 0.985 },
      { opacity: 1, y: 0, scale: 1, duration: 0.75, ease: 'premium-out', stagger: 0.06, clearProps: 'opacity,transform' },
    );
  };
  const queue = (el: HTMLElement) => {
    batch.push(el);
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(flush);
    }
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        io.unobserve(entry.target);
        queue(entry.target as HTMLElement);
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );

  const consider = (el: HTMLElement) => {
    if (seen.has(el)) return;
    seen.add(el);
    if (el.closest('[data-own-motion]')) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.95) {
      queue(el);
    } else {
      // Abaixo da dobra: escondido até a rolagem chegar (sem "piscar").
      gsap.set(el, { opacity: 0 });
      io.observe(el);
    }
  };

  const scan = (node: Node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.matches(CARD_SELECTOR)) consider(node);
    node.querySelectorAll<HTMLElement>(CARD_SELECTOR).forEach(consider);
  };

  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) m.addedNodes.forEach(scan);
  });
  mo.observe(root, { childList: true, subtree: true });
  scan(root);

  return () => {
    mo.disconnect();
    io.disconnect();
  };
}

// --- 3. Título da aba -----------------------------------------------------
let titleSplit: SplitText | null = null;

export function animateViewTitle(view: Element | null) {
  if (!view || prefersReducedMotion()) return;
  const h1 = view.querySelector<HTMLElement>('h1');
  if (!h1) return;
  titleSplit?.revert();
  const split = SplitText.create(h1, { type: 'words', mask: 'words' });
  giveMasksRoom(split);
  titleSplit = split;
  const lead = h1.nextElementSibling;
  const tl = gsap.timeline({ defaults: { ease: 'premium-out' } });
  tl.from(split.words, { yPercent: 115, duration: 0.85, stagger: 0.06, onComplete: () => split.revert() });
  if (lead && lead.tagName === 'P') tl.from(lead, { opacity: 0, y: 10, duration: 0.6, clearProps: 'opacity,transform' }, 0.25);
}
