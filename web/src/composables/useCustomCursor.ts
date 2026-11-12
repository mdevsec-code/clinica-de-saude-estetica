import { gsap, prefersReducedMotion, supportsFinePointer } from '@/lib/motion';

// Cursor do site público (só computador com mouse): um ponto que segue o
// ponteiro na hora e um anel que vem atrás, com um leve atraso elástico. Em
// cima de link/botão o anel cresce e ganha um véu rosé; em campo de texto,
// os dois somem (o cursor de texto do sistema volta). Dois elementos fixos,
// movidos com quickTo (transform) — sem layout, sem repintar a página.
// O painel administrativo continua com o cursor normal (ferramenta de
// trabalho): a classe .has-custom-cursor só é ligada fora de /admin.

let dot: HTMLElement | null = null;
let ring: HTMLElement | null = null;
let enabled = false;

function build() {
  dot = document.createElement('div');
  dot.className = 'cursor-dot';
  ring = document.createElement('div');
  ring.className = 'cursor-ring';
  for (const el of [ring, dot]) {
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
  }
  gsap.set([dot, ring], { xPercent: -50, yPercent: -50, opacity: 0 });

  const dx = gsap.quickTo(dot, 'x', { duration: 0.12, ease: 'power3.out' });
  const dy = gsap.quickTo(dot, 'y', { duration: 0.12, ease: 'power3.out' });
  const rx = gsap.quickTo(ring, 'x', { duration: 0.5, ease: 'power3.out' });
  const ry = gsap.quickTo(ring, 'y', { duration: 0.5, ease: 'power3.out' });

  let visible = false;
  let hovering = false;

  window.addEventListener(
    'pointermove',
    (e) => {
      if (!enabled || e.pointerType !== 'mouse') return;
      if (!visible) {
        visible = true;
        gsap.set([dot, ring], { x: e.clientX, y: e.clientY });
        gsap.to([dot, ring], { opacity: 1, duration: 0.3 });
      }
      dx(e.clientX);
      dy(e.clientY);
      rx(e.clientX);
      ry(e.clientY);

      const t = e.target as HTMLElement | null;
      const typing = !!t?.closest('input, textarea, select, [contenteditable="true"]');
      const interactive = !typing && !!t?.closest('a, button, [role="button"], label, summary, [data-cursor]');
      if (typing) {
        gsap.to([dot, ring], { opacity: 0, duration: 0.2, overwrite: 'auto' });
        return;
      }
      if (interactive !== hovering) {
        hovering = interactive;
        gsap.to(ring, { scale: interactive ? 1.75 : 1, duration: 0.45, ease: 'premium-out', overwrite: 'auto' });
        gsap.to(dot, { scale: interactive ? 0.4 : 1, duration: 0.3, overwrite: 'auto' });
        ring!.classList.toggle('cursor-ring--active', interactive);
      }
      gsap.to([dot, ring], { opacity: 1, duration: 0.2, overwrite: 'auto' });
    },
    { passive: true },
  );
  document.addEventListener('pointerleave', () => {
    visible = false;
    gsap.to([dot, ring], { opacity: 0, duration: 0.3 });
  });
  window.addEventListener('pointerdown', () => enabled && gsap.to(ring, { scale: hovering ? 1.45 : 0.8, duration: 0.15 }));
  window.addEventListener('pointerup', () => enabled && gsap.to(ring, { scale: hovering ? 1.75 : 1, duration: 0.4, ease: 'premium-out' }));
}

// Liga/desliga conforme a rota (site público sim, painel não).
export function setCustomCursor(on: boolean) {
  if (typeof window === 'undefined' || !supportsFinePointer() || prefersReducedMotion()) return;
  if (on && !dot) build();
  enabled = on;
  document.documentElement.classList.toggle('has-custom-cursor', on);
  if (!on && dot && ring) gsap.set([dot, ring], { opacity: 0 });
}
