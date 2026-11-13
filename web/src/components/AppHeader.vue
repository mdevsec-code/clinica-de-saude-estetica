<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { Flip, ScrollTrigger, gsap, prefersReducedMotion } from '@/lib/motion';
import { useSettingsStore } from '@/stores/settings';
import { instagramLink, whatsappLink } from '@/services/settings.service';
import { getSmoother } from '@/composables/useSmoothScroll';

const isMenuOpen = ref(false);
const isScrolled = ref(false);
const route = useRoute();
const router = useRouter();
const nav = ref<HTMLElement | null>(null);
const indicator = ref<HTMLElement | null>(null);

function closeMenu() {
  isMenuOpen.value = false;
}

// --- Menu do celular: tela cheia, abre num círculo a partir do botão ---
const settings = useSettingsStore();
settings.load();
const waHref = computed(() =>
  settings.data?.whatsapp ? whatsappLink(settings.data.whatsapp, 'Olá! Vim pelo site da Noely Cerqueira.') : null,
);
const igHref = computed(() => (settings.data?.instagram ? instagramLink(settings.data.instagram) : null));
const MOBILE_LINKS = [
  { to: '/', label: 'Início' },
  { to: '/servicos', label: 'Serviços' },
  { to: '/contato', label: 'Contato' },
  { to: '/agendar', label: 'Agendar' },
];

// A página não rola por trás do menu aberto; Esc fecha.
watch(isMenuOpen, (open) => getSmoother()?.paused(open));
watch(() => route.fullPath, closeMenu);
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') closeMenu();
}

function onMenuEnter(el: Element, done: () => void) {
  if (prefersReducedMotion()) return done();
  gsap
    .timeline({ onComplete: done })
    .fromTo(el, { clipPath: 'circle(0% at calc(100% - 38px) 38px)' }, { clipPath: 'circle(150% at calc(100% - 38px) 38px)', duration: 0.7, ease: 'premium-out' })
    .from(el.querySelectorAll('.mnav__link'), { yPercent: 60, opacity: 0, duration: 0.6, stagger: 0.07, ease: 'premium-out' }, 0.18)
    .from(el.querySelectorAll('.mnav__foot > *'), { y: 16, opacity: 0, duration: 0.5, stagger: 0.06, ease: 'premium-out' }, 0.38);
}
function onMenuLeave(el: Element, done: () => void) {
  if (prefersReducedMotion()) return done();
  gsap.to(el, { clipPath: 'circle(0% at calc(100% - 38px) 38px)', duration: 0.45, ease: 'premium-in-out', onComplete: done });
}

let scrollTrigger: ScrollTrigger | null = null;

// A "pílula" atrás do link ativo desliza suavemente até o novo destino a
// cada troca de rota, em vez de simplesmente reaparecer no lugar certo —
// Flip.from calcula sozinho a diferença entre a posição antiga e a nova (que
// já lemos ANTES da rota mudar) e anima só essa diferença.
function moveIndicatorTo(link: HTMLElement | null) {
  if (!indicator.value) return;
  // Sem aba ativa (ex.: na página de agendamento): esconde, em vez de deixar
  // a pílula parada na aba anterior parecendo selecionada.
  indicator.value.style.opacity = link ? '1' : '0';
  if (!link) return;
  const navRect = nav.value?.getBoundingClientRect();
  if (!navRect) return;

  const state = Flip.getState(indicator.value);
  const linkRect = link.getBoundingClientRect();
  indicator.value.style.width = `${linkRect.width}px`;
  indicator.value.style.height = `${linkRect.height}px`;
  indicator.value.style.transform = `translate(${linkRect.left - navRect.left}px, ${linkRect.top - navRect.top}px)`;

  if (prefersReducedMotion()) return;
  Flip.from(state, { duration: 0.5, ease: 'premium-out' });
}

async function syncIndicator() {
  await nextTick();
  const activeLink = nav.value?.querySelector<HTMLElement>('a.router-link-active');
  moveIndicatorTo(activeLink ?? null);
}

watch(() => route.path, syncIndicator);

onMounted(() => {
  window.addEventListener('keydown', onKey);
  scrollTrigger = ScrollTrigger.create({
    start: 'top -80',
    onUpdate: (self) => {
      isScrolled.value = self.scroll() > 80;
    },
  });

  // main.ts monta o app SEM esperar router.isReady() (documentado lá: o
  // ScrollSmoother precisa existir antes de qualquer view montar, então o
  // mount não pode ficar bloqueado numa Promise do router) — isso significa
  // que no carregamento "a frio" de uma rota com componente lazy (toda view
  // pública é import() dinâmico), o AppHeader já roda seu onMounted ANTES do
  // router terminar de baixar o chunk e resolver a navegação inicial. Nesse
  // instante nenhum <RouterLink> ainda tem router-link-active, então o
  // syncIndicator() daqui embaixo sempre encontra `link` nulo — e como não
  // há troca de rota depois disso para o watch acima recalcular, a pílula
  // fica presa em 0×0 (invisível) até o usuário navegar manualmente pela
  // primeira vez. router.isReady() é a forma correta de esperar por isso
  // (ao contrário de nextTick/rAF, que só esperam o Vue, não o router).
  syncIndicator();
  router.isReady().then(syncIndicator);
});

onUnmounted(() => {
  scrollTrigger?.kill();
  window.removeEventListener('keydown', onKey);
  getSmoother()?.paused(false);
});
</script>

<template>
  <header class="header" :class="{ 'header--scrolled': isScrolled }">
    <div class="header__bar container">
      <RouterLink to="/" class="header__brand" @click="closeMenu">
        <img src="/brand/logo-noely-cerqueira.png" alt="Noely Cerqueira — Estética e Micropigmentação" />
      </RouterLink>

      <div class="header__actions">
        <nav class="header__nav header__nav--desktop" aria-label="Navegação principal">
          <div ref="nav" class="header__nav-group">
            <span ref="indicator" class="header__nav-indicator" aria-hidden="true" />
            <RouterLink to="/">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11.5 12 4l8 7.5" /><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" /></svg>
              Início
            </RouterLink>
            <RouterLink to="/servicos">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="m7 7 2.5 2.5M17 7l-2.5 2.5M7 17l2.5-2.5M17 17l-2.5-2.5" /></svg>
              Serviços
            </RouterLink>
            <RouterLink to="/contato">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-11.8 7.8L4 21l1.8-5A8.5 8.5 0 1 1 21 11.5Z" /></svg>
              Contato
            </RouterLink>
          </div>
          <RouterLink to="/agendar" class="header__cta">
            Agendar
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </RouterLink>
        </nav>

        <div class="header__admin-slot">
          <RouterLink
            to="/admin/login"
            class="header__admin-link"
            aria-label="Área administrativa"
            data-tooltip="Área administrativa"
            data-tooltip-pos="bottom"
          >
            <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="4" y="10" width="16" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
          </RouterLink>
        </div>

        <button
          class="header__menu-toggle"
          type="button"
          :aria-expanded="isMenuOpen"
          aria-controls="mobile-nav"
          :aria-label="isMenuOpen ? 'Fechar menu' : 'Abrir menu'"
          @click="isMenuOpen = !isMenuOpen"
        >
          <span />
          <span />
          <span />
        </button>
      </div>
    </div>

    <!-- Fora do conteúdo suavizado (ScrollSmoother): position fixed só
         funciona lá. Tem a própria barra com o X, por cima de tudo. -->
    <Teleport to="#overlay-slot">
      <Transition :css="false" @enter="onMenuEnter" @leave="onMenuLeave">
        <div v-if="isMenuOpen" id="mobile-nav" class="mnav" role="dialog" aria-modal="true" aria-label="Menu">
          <div class="mnav__bar">
            <RouterLink to="/" class="mnav__brand" @click="closeMenu">
              <img src="/brand/logo-noely-cerqueira.png" alt="Noely Cerqueira" />
            </RouterLink>
            <button type="button" class="mnav__close" aria-label="Fechar menu" @click="closeMenu">
              <span /><span />
            </button>
          </div>

          <nav class="mnav__links" aria-label="Navegação móvel">
            <RouterLink v-for="(link, i) in MOBILE_LINKS" :key="link.to" :to="link.to" class="mnav__link" @click="closeMenu">
              <span class="mnav__num">0{{ i + 1 }}</span>
              <span class="mnav__label">{{ link.label }}</span>
              <svg class="mnav__arrow" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </RouterLink>
          </nav>

          <div class="mnav__foot">
            <RouterLink to="/agendar" class="mnav__cta" @click="closeMenu">Agendar atendimento</RouterLink>
            <div class="mnav__social">
              <a v-if="waHref" :href="waHref" target="_blank" rel="noopener">WhatsApp</a>
              <a v-if="igHref" :href="igHref" target="_blank" rel="noopener">Instagram</a>
            </div>
            <p class="mnav__tag">Clínica de Saúde Estética · Camaçari (BA)</p>
          </div>
        </div>
      </Transition>
    </Teleport>
  </header>
</template>

<style scoped>
.header {
  position: sticky;
  top: 0;
  z-index: 40;
  background: rgba(251, 245, 241, 0.75);
  backdrop-filter: blur(8px) saturate(160%);
  border-bottom: 1px solid transparent;
  transition: background var(--duration-base) var(--ease-premium), border-color var(--duration-base) var(--ease-premium), box-shadow var(--duration-base) var(--ease-premium);
}

.header--scrolled {
  background: rgba(251, 245, 241, 0.92);
  border-color: var(--color-border);
  box-shadow: var(--shadow-sm);
}

.header__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 110px;
  transition: height var(--duration-base) var(--ease-premium);
}

.header--scrolled .header__bar {
  height: 88px;
}

.header__brand img {
  /* A logo é o lockup completo (monograma + nome + subtítulo) — precisa de
     altura suficiente para o texto continuar legível, não só o ícone.
     Aumentada a pedido explícito do cliente (mais de uma vez — a logo é
     pequena/fina e sempre acaba lendo como "pouco visível" em qualquer
     tamanho menor que isso). */
  height: 96px;
  width: auto;
  transition: height var(--duration-base) var(--ease-premium), transform var(--duration-base) var(--ease-premium);
}

.header--scrolled .header__brand img {
  height: 74px;
}

.header__brand:hover img {
  transform: scale(1.03) rotate(-1deg);
}

.header__menu-toggle span {
  transition: transform var(--duration-base) var(--ease-premium), opacity var(--duration-fast) var(--ease-standard);
}

/* As 3 barras viram um X. */
.header__menu-toggle[aria-expanded='true'] span:nth-child(1) {
  transform: translateY(7px) rotate(45deg);
}

.header__menu-toggle[aria-expanded='true'] span:nth-child(2) {
  opacity: 0;
  transform: scaleX(0);
}

.header__menu-toggle[aria-expanded='true'] span:nth-child(3) {
  transform: translateY(-7px) rotate(-45deg);
}

@media (prefers-reduced-motion: reduce) {
  .header__brand:hover img {
    transform: none;
  }
}

.header__actions {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.header__nav--desktop {
  display: none;
  align-items: center;
  gap: var(--space-4);
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--color-ink);
}

/* Início/Serviços/Contato como um único grupo "pílula" (em vez de três links
   soltos flutuando no espaço) — lê como um controle segmentado coeso, e
   deixa o CTA "Agendar" claramente separado como a ação principal, não mais
   um quarto item igual aos outros três. */
.header__nav-group {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 5px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-sm), inset 0 1px 2px rgba(58, 44, 42, 0.04);
}

.header__nav-indicator {
  position: absolute;
  /* top/left ficam em 0 de propósito: moveIndicatorTo (script acima) já
     calcula um transform:translate() com a posição inteira do link ativo
     relativa a .header__nav-group (getBoundingClientRect dos dois). Um
     top/left diferente de zero aqui SOMARIA a esse translate — a pílula
     ficava deslocada para baixo/direita do rótulo em vez de encaixada nele
     (mais perceptível quando "Contato", o último item, estava ativo). */
  top: 0;
  left: 0;
  background: var(--color-rose-900);
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-sm);
  z-index: 0;
}

.header__nav-group > a {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 17px;
  border-radius: var(--radius-pill);
  transition: color var(--duration-fast) var(--ease-standard);
}

.header__nav-group > a svg {
  opacity: 0.75;
  transition: opacity var(--duration-fast) var(--ease-standard);
}

.header__nav-group > a:hover {
  color: var(--color-rose-700);
}

.header__nav-group > a:hover svg {
  opacity: 1;
}

.header__nav-group > a.router-link-active {
  color: #fff;
  font-weight: 700;
}

.header__nav-group > a.router-link-active svg {
  opacity: 1;
}

.header__nav--mobile a svg {
  margin-right: 8px;
  vertical-align: -3px;
  opacity: 0.75;
}

.header__nav--mobile a.router-link-active {
  color: var(--color-rose-700);
  background: var(--color-rose-100);
  font-weight: 700;
}

.header__cta {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: var(--color-rose-900);
  color: #fff !important;
  padding: 11px 22px;
  border-radius: var(--radius-pill);
  font-weight: 700;
  box-shadow: var(--shadow-sm);
  transition: transform var(--duration-base) var(--ease-premium), box-shadow var(--duration-base) var(--ease-premium);
}

.header__cta svg {
  transition: transform var(--duration-base) var(--ease-premium);
}

/* Só em aparelho com mouse: no celular o :hover ficava "grudado" depois do
   toque e o botão parecia preso em selecionado. */
@media (hover: hover) {
  .header__cta:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-glow);
  }

  .header__cta:hover svg {
    transform: translateX(3px);
  }
}

.header__cta:active {
  transform: translateY(0) scale(0.97);
}

/* Acesso à área administrativa: a pedido do cliente, precisa ficar sempre
   visível no topo do site (não escondido só no rodapé) — um ícone discreto
   ao lado da navegação em vez de um item de texto, para não competir com o
   CTA principal "Agendar" nem parecer parte da navegação voltada à cliente. */
/* Divisor + espaçamento ficam neste wrapper, não em .header__admin-link: o
   link precisa ser uma caixa 48×48 perfeitamente simétrica, porque tanto o
   ícone (centralizado por flex) quanto o tooltip (centralizado via
   left:50%) tomam ESTA caixa como referência. Um padding-left assimétrico
   aqui deslocaria o ícone para a direita do centro geométrico da caixa sem
   deslocar o tooltip junto — a seta do tooltip parava de apontar pro ícone. */
.header__admin-slot {
  display: inline-flex;
  flex-shrink: 0;
  margin-left: var(--space-1);
  padding-left: calc(var(--space-2) + 1px);
  border-left: 1px solid var(--color-border);
}

.header__admin-link {
  position: relative;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  color: var(--color-ink-soft);
  transition: color var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard);
}

.header__admin-link svg {
  width: 21px;
  height: 21px;
  border-radius: 50%;
  padding: 10px;
  box-sizing: content-box;
  background: var(--color-rose-100);
  color: inherit;
  box-shadow: var(--shadow-sm);
  transition: background var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard);
}

.header__admin-link:hover {
  color: var(--color-rose-700);
}

.header__admin-link:hover svg {
  background: var(--color-rose-700);
  color: #fff;
  transform: translateY(-2px);
  box-shadow: var(--shadow-glow);
}

/* O tooltip em si (pill na paleta da marca + setinha) vem do mecanismo
   compartilhado [data-tooltip] em styles/global.css — nasceu aqui (era um
   <span> + CSS só deste componente) e foi generalizado pra todo o app.
   data-tooltip-pos="bottom" porque este ícone fica colado no topo da
   viewport: não há espaço acima dele para o posicionamento padrão. */

.header__menu-toggle {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  width: 44px;
  height: 44px;
  background: none;
  border: none;
  cursor: pointer;
}

.header__menu-toggle span {
  width: 22px;
  height: 2px;
  background: var(--color-rose-900);
  border-radius: 2px;
}

/* --- Menu do celular em tela cheia --- */
.mnav {
  position: fixed;
  inset: 0;
  z-index: 95;
  display: flex;
  flex-direction: column;
  padding: env(safe-area-inset-top, 0px) var(--space-5) calc(var(--space-6) + env(safe-area-inset-bottom, 0px));
  background:
    radial-gradient(120% 70% at 100% 0%, rgba(220, 171, 168, 0.55), transparent 60%),
    radial-gradient(90% 60% at 0% 100%, rgba(200, 164, 101, 0.22), transparent 65%),
    var(--color-bg);
  overflow-y: auto;
}

.mnav__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 76px;
}

.mnav__brand img {
  height: 58px;
  width: auto;
}

.mnav__close {
  position: relative;
  width: 48px;
  height: 48px;
  border: 1px solid var(--color-rose-300);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.55);
}

.mnav__close span {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 20px;
  height: 2px;
  margin: -1px 0 0 -10px;
  background: var(--color-rose-900);
  border-radius: 2px;
  transform: rotate(45deg);
}

.mnav__close span + span {
  transform: rotate(-45deg);
}

.mnav__links {
  display: flex;
  flex-direction: column;
  margin-top: var(--space-6);
}

.mnav__link {
  display: grid;
  grid-template-columns: 2.4rem 1fr auto;
  align-items: baseline;
  padding: var(--space-4) 0;
  border-bottom: 1px solid rgba(111, 61, 67, 0.14);
  color: var(--color-rose-900);
  text-decoration: none;
}

.mnav__num {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--color-gold-700);
}

.mnav__label {
  font-family: var(--font-serif);
  font-size: clamp(2.1rem, 9vw, 2.8rem);
  line-height: 1.1;
}

.mnav__arrow {
  align-self: center;
  opacity: 0.45;
  transition: transform var(--duration-base) var(--ease-premium), opacity var(--duration-base) var(--ease-premium);
}

.mnav__link.router-link-exact-active .mnav__label {
  font-style: italic;
}

.mnav__link.router-link-exact-active .mnav__arrow,
.mnav__link:active .mnav__arrow {
  opacity: 1;
  transform: translateX(4px);
}

.mnav__foot {
  margin-top: auto;
  padding-top: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.mnav__cta {
  display: block;
  padding: 16px;
  border-radius: var(--radius-pill);
  text-align: center;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, var(--color-rose-700), var(--color-rose-900) 60%, var(--color-dusk-700));
  box-shadow: 0 14px 34px -16px rgba(111, 61, 67, 0.8);
}

.mnav__social {
  display: flex;
  gap: var(--space-3);
}

.mnav__social a {
  flex: 1;
  padding: 12px;
  border: 1px solid var(--color-rose-300);
  border-radius: var(--radius-pill);
  text-align: center;
  font-weight: 600;
  color: var(--color-rose-900);
  background: rgba(255, 255, 255, 0.5);
}

.mnav__tag {
  margin: 0;
  text-align: center;
  font-size: 0.8rem;
  color: var(--color-ink-muted);
}

.header__nav--mobile {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-4) var(--space-5);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.header__nav--mobile a {
  padding: var(--space-3) var(--space-2);
  font-weight: 500;
  border-radius: var(--radius-sm);
}

.header__nav--mobile .header__cta {
  text-align: center;
  margin-top: var(--space-2);
}

@media (min-width: 900px) {
  .header__nav--desktop {
    display: flex;
  }
  .header__menu-toggle {
    display: none;
  }
}
</style>
