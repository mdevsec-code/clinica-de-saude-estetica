<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { Flip, ScrollTrigger, prefersReducedMotion } from '@/lib/motion';
import { applyMagneticButtons } from '@/composables/useMagneticButton';

const isMenuOpen = ref(false);
const isScrolled = ref(false);
const route = useRoute();
const router = useRouter();
const nav = ref<HTMLElement | null>(null);
const indicator = ref<HTMLElement | null>(null);

function closeMenu() {
  isMenuOpen.value = false;
}

let scrollTrigger: ScrollTrigger | null = null;

// A "pílula" atrás do link ativo desliza suavemente até o novo destino a
// cada troca de rota, em vez de simplesmente reaparecer no lugar certo —
// Flip.from calcula sozinho a diferença entre a posição antiga e a nova (que
// já lemos ANTES da rota mudar) e anima só essa diferença.
function moveIndicatorTo(link: HTMLElement | null) {
  if (!indicator.value || !link) return;
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
  applyMagneticButtons('.header__cta', 0.25);
});

onUnmounted(() => {
  scrollTrigger?.kill();
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

        <RouterLink to="/admin/login" class="header__admin-link" aria-label="Área administrativa">
          <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="4" y="10" width="16" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          <span class="header__admin-tooltip" role="tooltip">Área administrativa</span>
        </RouterLink>

        <button
          class="header__menu-toggle"
          type="button"
          :aria-expanded="isMenuOpen"
          aria-controls="mobile-nav"
          aria-label="Abrir menu"
          @click="isMenuOpen = !isMenuOpen"
        >
          <span />
          <span />
          <span />
        </button>
      </div>
    </div>

    <Transition name="mobile-nav">
      <nav
        v-if="isMenuOpen"
        id="mobile-nav"
        class="header__nav header__nav--mobile"
        aria-label="Navegação móvel"
      >
        <RouterLink to="/" @click="closeMenu">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11.5 12 4l8 7.5" /><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" /></svg>
          Início
        </RouterLink>
        <RouterLink to="/servicos" @click="closeMenu">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="m7 7 2.5 2.5M17 7l-2.5 2.5M7 17l2.5-2.5M17 17l-2.5-2.5" /></svg>
          Serviços
        </RouterLink>
        <RouterLink to="/contato" @click="closeMenu">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-11.8 7.8L4 21l1.8-5A8.5 8.5 0 1 1 21 11.5Z" /></svg>
          Contato
        </RouterLink>
        <RouterLink to="/agendar" class="header__cta" @click="closeMenu">Agendar atendimento</RouterLink>
      </nav>
    </Transition>
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

.mobile-nav-enter-active,
.mobile-nav-leave-active {
  transition: opacity var(--duration-base) var(--ease-premium), transform var(--duration-base) var(--ease-premium);
}

.mobile-nav-enter-from,
.mobile-nav-leave-to {
  opacity: 0;
  transform: translateY(-10px);
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
  top: 5px;
  left: 5px;
  background: linear-gradient(135deg, var(--color-rose-700), var(--color-rose-900));
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
  background: linear-gradient(135deg, var(--color-rose-700), var(--color-rose-900));
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

.header__cta:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-glow);
}

.header__cta:hover svg {
  transform: translateX(3px);
}

.header__cta:active {
  transform: translateY(0) scale(0.97);
}

/* Acesso à área administrativa: a pedido do cliente, precisa ficar sempre
   visível no topo do site (não escondido só no rodapé) — um ícone discreto
   ao lado da navegação em vez de um item de texto, para não competir com o
   CTA principal "Agendar" nem parecer parte da navegação voltada à cliente. */
.header__admin-link {
  position: relative;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  margin-left: var(--space-1);
  padding-left: calc(var(--space-2) + 1px);
  border-left: 1px solid var(--color-border);
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

/* Tooltip customizado (em vez do title nativo do navegador, que renderiza
   uma caixinha cinza do sistema fora de contexto com o resto do site) —
   pequeno cartão na paleta da marca, com setinha, que aparece em hover/foco. */
.header__admin-tooltip {
  position: absolute;
  top: calc(100% + 12px);
  left: 50%;
  z-index: 10;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  padding: 8px 16px;
  border-radius: var(--radius-pill);
  background: linear-gradient(135deg, var(--color-rose-700), var(--color-rose-900));
  color: #fff;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  box-shadow: var(--shadow-md, var(--shadow-lg));
  opacity: 0;
  pointer-events: none;
  transform: translateX(-50%) translateY(-4px) scale(0.94);
  transform-origin: top center;
  transition: opacity var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard);
}

.header__admin-tooltip::before {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 50%;
  width: 10px;
  height: 10px;
  background: var(--color-rose-700);
  transform: translateX(-50%) rotate(45deg);
  border-radius: 3px 0 0 0;
}

.header__admin-link:hover .header__admin-tooltip,
.header__admin-link:focus-visible .header__admin-tooltip {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(-50%) translateY(0) scale(1);
}

@media (prefers-reduced-motion: reduce) {
  .header__admin-tooltip {
    transition: opacity var(--duration-fast) linear;
    transform: none;
  }
}

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
