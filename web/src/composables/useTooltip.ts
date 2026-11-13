// Tooltip único do programa: qualquer elemento com data-tooltip="texto"
// (data-tooltip-pos="bottom" prefere abaixo). Antes era um pseudo-elemento
// dentro do próprio elemento e ficava cortado por qualquer caixa com
// overflow (gráficos que rolam de lado, cartões, cabeçalho). Agora é um
// balão só, preso ao <body> e posicionado pela tela: vira para baixo quando
// não cabe em cima e nunca passa da borda. O texto continua decorativo —
// cada gatilho tem seu próprio nome acessível (aria-label/texto).

const GAP = 10;
const EDGE = 8;

export function installTooltips() {
  if (typeof window === 'undefined') return;
  const tip = document.createElement('div');
  tip.className = 'app-tooltip';
  tip.setAttribute('role', 'presentation');
  tip.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tip);

  let current: HTMLElement | null = null;

  const place = () => {
    if (!current) return;
    const r = current.getBoundingClientRect();
    if (!r.width && !r.height) return hide();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const wantsBelow = current.dataset.tooltipPos === 'bottom';
    const fitsAbove = r.top - GAP - h >= EDGE;
    const fitsBelow = r.bottom + GAP + h <= window.innerHeight - EDGE;
    const below = wantsBelow ? fitsBelow || !fitsAbove : !fitsAbove && fitsBelow;
    const center = r.left + r.width / 2;
    const left = Math.min(Math.max(center - w / 2, EDGE), window.innerWidth - w - EDGE);
    const top = below ? r.bottom + GAP : r.top - GAP - h;
    tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    // A seta continua apontando para o meio do elemento mesmo quando o
    // balão foi empurrado para dentro da tela.
    tip.style.setProperty('--arrow-x', `${Math.round(Math.min(Math.max(center - left, 14), w - 14))}px`);
    tip.dataset.side = below ? 'bottom' : 'top';
  };

  const show = (el: HTMLElement) => {
    const text = el.dataset.tooltip;
    if (!text) return;
    current = el;
    tip.textContent = text;
    tip.classList.add('is-visible');
    place();
  };
  const hide = () => {
    current = null;
    tip.classList.remove('is-visible');
  };

  document.addEventListener('pointerover', (e) => {
    const el = (e.target as Element | null)?.closest<HTMLElement>('[data-tooltip]');
    if (el && el !== current) show(el);
    else if (!el && current) hide();
  });
  document.addEventListener('focusin', (e) => {
    const el = (e.target as Element | null)?.closest<HTMLElement>('[data-tooltip]');
    if (el && (e.target as HTMLElement).matches(':focus-visible')) show(el);
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('pointerdown', hide);
  window.addEventListener('scroll', hide, { passive: true, capture: true });
  window.addEventListener('resize', hide);
}
