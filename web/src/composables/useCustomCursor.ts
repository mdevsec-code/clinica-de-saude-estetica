import { gsap, prefersReducedMotion, supportsFinePointer } from '@/lib/motion';

// Cursor do site público (só computador com mouse): um ponto que acompanha o
// ponteiro sem atraso e um anel que vem logo atrás. Em cima de link/botão o
// anel cresce e ganha um véu rosé; em campo de texto e em mapas/iframes o
// cursor próprio some e o do sistema volta. O painel administrativo
// continua com o cursor normal (a classe .has-custom-cursor só fora de /admin).
//
// Por que está escrito assim (versão anterior parecia "travada"):
// - o ponto é posicionado direto a cada movimento (quickSetter), sem tween;
// - opacidade e escala só animam quando o estado MUDA — antes cada
//   movimento do mouse criava novas animações, o que engasgava;
// - ao rolar a página com o mouse parado, o estado (botão ou não) é
//   recalculado pelo que ficou embaixo do ponteiro;
// - contorno branco nos dois elementos: visível no fundo claro e no escuro.

let dot: HTMLElement | null = null;
let ring: HTMLElement | null = null;
let enabled = false;

const TYPING = 'input, textarea, select, [contenteditable="true"]';
const INTERACTIVE = 'a, button, [role="button"], label, summary, [data-cursor]';

function build() {
  dot = document.createElement('div');
  dot.className = 'cursor-dot';
  ring = document.createElement('div');
  ring.className = 'cursor-ring';
  for (const el of [ring, dot]) {
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
  }
  const d = dot;
  const r = ring;
  gsap.set([d, r], { xPercent: -50, yPercent: -50, opacity: 0 });

  const setDotX = gsap.quickSetter(d, 'x', 'px') as (v: number) => void;
  const setDotY = gsap.quickSetter(d, 'y', 'px') as (v: number) => void;
  const ringX = gsap.quickTo(r, 'x', { duration: 0.28, ease: 'power3.out' });
  const ringY = gsap.quickTo(r, 'y', { duration: 0.28, ease: 'power3.out' });

  let shown = false;
  let hovering = false;
  let pressing = false;
  let lastX = -1;
  let lastY = -1;

  const setShown = (value: boolean) => {
    if (value === shown) return;
    shown = value;
    gsap.to([d, r], { opacity: value ? 1 : 0, duration: 0.2, overwrite: 'auto' });
  };
  const applyScale = () => {
    gsap.to(r, { scale: (hovering ? 1.6 : 1) * (pressing ? 0.82 : 1), duration: 0.3, ease: 'power3.out', overwrite: 'auto' });
    gsap.to(d, { scale: hovering ? 0.55 : 1, duration: 0.2, overwrite: 'auto' });
  };
  const update = (target: Element | null) => {
    if (!target || target.closest(TYPING) || target.tagName === 'IFRAME') {
      setShown(false);
      return;
    }
    setShown(true);
    const interactive = !!target.closest(INTERACTIVE);
    if (interactive !== hovering) {
      hovering = interactive;
      r.classList.toggle('cursor-ring--active', interactive);
      applyScale();
    }
  };

  window.addEventListener(
    'pointermove',
    (e) => {
      if (!enabled || e.pointerType !== 'mouse') return;
      if (lastX < 0) gsap.set(r, { x: e.clientX, y: e.clientY }); // primeira aparição: sem deslizar do canto
      lastX = e.clientX;
      lastY = e.clientY;
      setDotX(lastX);
      setDotY(lastY);
      ringX(lastX);
      ringY(lastY);
      update(e.target as Element | null);
    },
    { passive: true },
  );
  // Rolando com o mouse parado: o que está embaixo do ponteiro mudou.
  window.addEventListener(
    'scroll',
    () => {
      if (enabled && shown && lastX >= 0) update(document.elementFromPoint(lastX, lastY));
    },
    { passive: true, capture: true },
  );
  // Saiu da janela ou entrou num iframe (mapa do Google): esconde.
  document.addEventListener('mouseout', (e) => {
    const to = e.relatedTarget as Element | null;
    if (!to || to.tagName === 'IFRAME') setShown(false);
  });
  window.addEventListener('blur', () => setShown(false));
  window.addEventListener('pointerdown', (e) => {
    if (!enabled || e.pointerType !== 'mouse') return;
    pressing = true;
    applyScale();
  });
  window.addEventListener('pointerup', () => {
    if (!pressing) return;
    pressing = false;
    applyScale();
  });
}

// Liga/desliga conforme a rota (site público sim, painel não).
export function setCustomCursor(on: boolean) {
  if (typeof window === 'undefined' || !supportsFinePointer() || prefersReducedMotion()) return;
  if (on && !dot) build();
  enabled = on;
  document.documentElement.classList.toggle('has-custom-cursor', on);
  if (!on && dot && ring) gsap.set([dot, ring], { opacity: 0 });
}
