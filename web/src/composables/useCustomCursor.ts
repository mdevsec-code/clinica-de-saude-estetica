import { gsap, prefersReducedMotion, supportsFinePointer } from '@/lib/motion';

// Cursor próprio do programa inteiro — site e painel (só computador com mouse):
// uma seta vinho com contorno branco (a ponta é o ponto exato do clique) e,
// em cima de link/botão, um círculo rosé que surge atrás dela. Em campo de
// texto e em mapas/iframes o cursor próprio some e o do sistema volta.
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
const INTERACTIVE = 'a, button, [role="button"], [role="option"], [role="tab"], [role="menuitem"], label, summary, [data-cursor], [tabindex]:not([tabindex="-1"])';

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
  // A seta é posicionada pela ponta (canto); o círculo, pelo centro.
  gsap.set(d, { opacity: 0, transformOrigin: '4px 3px' });
  gsap.set(r, { xPercent: -50, yPercent: -50, opacity: 0, scale: 0 });

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
    gsap.to(r, { scale: hovering ? (pressing ? 0.8 : 1) : 0, duration: 0.3, ease: 'power3.out', overwrite: 'auto' });
    gsap.to(d, { scale: pressing ? 0.86 : hovering ? 1.08 : 1, duration: 0.18, overwrite: 'auto' });
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

// Liga/desliga o cursor próprio.
export function setCustomCursor(on: boolean) {
  if (typeof window === 'undefined' || !supportsFinePointer() || prefersReducedMotion()) return;
  if (on && !dot) build();
  enabled = on;
  document.documentElement.classList.toggle('has-custom-cursor', on);
  if (!on && dot && ring) gsap.set([dot, ring], { opacity: 0 });
}
