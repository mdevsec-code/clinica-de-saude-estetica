import { gsap, prefersReducedMotion } from '@/lib/motion';

// Onda de toque nos botões (site e painel): um círculo de luz nasce no ponto
// exato do clique e se espalha. Um listener só, no documento (delegação) —
// funciona em botões criados depois, sem precisar registrar cada um. Só
// transform/opacity num <span> descartável: barato até em hardware modesto.
const SELECTOR = '.button, .tl-menu__item, .admin__logout, .admin-cmdk-trigger';

let installed = false;

export function installRipple() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (prefersReducedMotion() || event.button !== 0) return;
      const host = (event.target as HTMLElement | null)?.closest<HTMLElement>(SELECTOR);
      if (!host || (host as HTMLButtonElement).disabled) return;
      const rect = host.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2.4;
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      ripple.setAttribute('aria-hidden', 'true');
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
      host.appendChild(ripple);
      gsap.fromTo(
        ripple,
        { scale: 0, opacity: 0.38 },
        { scale: 1, opacity: 0, duration: 0.75, ease: 'power2.out', onComplete: () => ripple.remove() },
      );
    },
    { passive: true },
  );
}
