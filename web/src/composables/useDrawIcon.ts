import { gsap, ScrollTrigger, prefersReducedMotion } from '@/lib/motion';

// Ícones de traço (CategoryIcon, ícones de diferenciais) "se desenham"
// sozinhos quando o card entra na tela, em vez de simplesmente aparecerem
// prontos — um detalhe de acabamento que a maioria dos sites nem tenta,
// porque exige o plugin DrawSVG (hoje gratuito no pacote gsap, mas por muito
// tempo só disponível no Club GreenSock pago). Precisa rodar DEPOIS do
// stagger-reveal do card (senão a linha final do ícone já pintada some por
// trás do fade do card pai) — por isso aceita um `delay`.
export function applyIconDraw(containerSelector: string, iconSelector: string, delay = 0.15) {
  if (prefersReducedMotion()) return;

  const container = document.querySelector(containerSelector);
  if (!container) return;

  const paths = container.querySelectorAll<SVGPathElement>(`${iconSelector} path`);
  if (!paths.length) return;

  gsap.set(paths, { drawSVG: '0%' });

  paths.forEach((path) => {
    const card = path.closest('[data-icon-card]') ?? container;
    gsap.to(path, {
      drawSVG: '100%',
      duration: 1.1,
      delay,
      ease: 'power2.inOut',
      scrollTrigger: { trigger: card as Element, start: 'top 85%' },
    });
  });
}

export function refreshIconDraw() {
  ScrollTrigger.refresh();
}
