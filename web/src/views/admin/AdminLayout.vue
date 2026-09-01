<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { Flip, prefersReducedMotion } from '@/lib/motion';
import { applyMagneticButtons } from '@/composables/useMagneticButton';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const nav = ref<HTMLElement | null>(null);
const indicator = ref<HTMLElement | null>(null);

// Ordem visual das abas (esquerda → direita na nav) — usada só para decidir
// a DIREÇÃO da transição entre views, não a navegação em si. Indo para uma
// aba mais à direita, o conteúdo novo entra vindo da direita (como se
// estivesse "adiante" na fila); indo para uma mais à esquerda, entra vindo
// da esquerda. Sem isso, toda troca de aba tinha a mesma animação genérica
// independente de para onde o usuário estava realmente navegando.
const NAV_ORDER = ['admin-dashboard', 'admin-catalog', 'admin-agenda', 'admin-finance', 'admin-inventory', 'admin-users'];
const transitionName = ref<'admin-tab-forward' | 'admin-tab-back'>('admin-tab-forward');
watch(
  () => route.name,
  (newName, oldName) => {
    const newIdx = NAV_ORDER.indexOf(String(newName));
    const oldIdx = NAV_ORDER.indexOf(String(oldName));
    transitionName.value = newIdx >= oldIdx ? 'admin-tab-forward' : 'admin-tab-back';
  },
);

// Mesma técnica da pílula ativa do header público (ver AppHeader.vue): em
// vez de só trocar a cor do link ativo, a pílula desliza suavemente até o
// novo destino a cada troca de aba do painel.
function moveIndicatorTo(link: HTMLElement | null) {
  if (!indicator.value || !link || !nav.value) return;
  const navRect = nav.value.getBoundingClientRect();
  const state = Flip.getState(indicator.value);
  const linkRect = link.getBoundingClientRect();
  indicator.value.style.width = `${linkRect.width}px`;
  indicator.value.style.height = `${linkRect.height}px`;
  indicator.value.style.transform = `translate(${linkRect.left - navRect.left}px, ${linkRect.top - navRect.top}px)`;

  if (prefersReducedMotion()) return;
  Flip.from(state, { duration: 0.45, ease: 'premium-out' });
}

async function syncIndicator() {
  await nextTick();
  // router-link-active (não -exact-active) é prefixo, não igualdade: como
  // "Painel" resolve para o path exato /admin, e /admin é prefixo de TODA
  // sub-rota (/admin/financeiro, /admin/agenda...), ele ficaria marcado
  // ativo simultaneamente com a aba de verdade em qualquer sub-página — e,
  // por vir primeiro no DOM, sempre "ganhava" do querySelector. Only a rota
  // atual bate com -exact-active.
  const activeLink = nav.value?.querySelector<HTMLElement>('a.router-link-exact-active');
  moveIndicatorTo(activeLink ?? null);
  activeLink?.scrollIntoView({ block: 'nearest', inline: 'nearest' });

  // Cada view do painel monta seus próprios botões primários (Criar
  // categoria, Novo agendamento, Adicionar gasto...) — reaplica o
  // magnetismo a cada troca de rota, já que os elementos de antes não
  // existem mais no DOM depois da troca.
  applyMagneticButtons('.admin__content .button--primary', 0.25);
}

watch(() => route.path, syncIndicator);
onMounted(() => {
  syncIndicator();
  // Mesma cautela do AppHeader.vue contra o carregamento "a frio": garante
  // que a pílula recalcula depois que o router confirma a navegação
  // inicial (chunk async da view filha incluído), mesmo que nextTick() já
  // tenha sido suficiente na maioria dos casos aqui.
  router.isReady().then(syncIndicator);
});

// Fonte um pouco maior no painel administrativo em telas de mesa — o painel
// usa uma escala mais compacta que o site público de propósito (é uma
// ferramenta de trabalho, não uma vitrine), mas compacta demais numa tela
// grande de escritório. A classe só importa a partir de 900px (ver
// global.css); em mobile não faz diferença nenhuma.
onMounted(() => document.documentElement.classList.add('is-admin'));
onUnmounted(() => document.documentElement.classList.remove('is-admin'));

function onLogout() {
  auth.logout();
  router.push({ name: 'admin-login' });
}
</script>

<template>
  <div class="admin">
    <header class="admin__topbar">
      <div class="admin__topbar-row">
        <RouterLink to="/" class="admin__brand">
          <img src="/brand/logo-noely-cerqueira.png" alt="Noely Cerqueira" />
          <span class="admin__brand-divider" aria-hidden="true" />
          <span class="admin__brand-title">Painel<br />Administrativo</span>
        </RouterLink>

        <div class="admin__account">
          <span v-if="auth.user" class="admin__user">
            {{ auth.user.name }}
            <span class="admin__role">{{ auth.user.role === 'ADMIN' ? 'Administrador' : 'Recepção' }}</span>
          </span>
          <button type="button" class="admin__logout" @click="onLogout">
            <span>Sair</span>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </div>

      <nav ref="nav" class="admin__nav" aria-label="Navegação do painel">
        <span ref="indicator" class="admin__nav-indicator" aria-hidden="true" />
        <RouterLink :to="{ name: 'admin-dashboard' }">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.2" /><rect x="14" y="3" width="7" height="5" rx="1.2" /><rect x="14" y="12" width="7" height="9" rx="1.2" /><rect x="3" y="16" width="7" height="5" rx="1.2" /></svg>
          Painel
        </RouterLink>
        <RouterLink :to="{ name: 'admin-catalog' }">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 12.5 12.5 20.5a2 2 0 0 1-2.83 0l-6.17-6.17a2 2 0 0 1 0-2.83L11.5 3.5H19a1.5 1.5 0 0 1 1.5 1.5Z" /><circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" /></svg>
          Serviços
        </RouterLink>
        <RouterLink :to="{ name: 'admin-agenda' }">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
          Agenda
        </RouterLink>
        <RouterLink :to="{ name: 'admin-finance' }">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="6" width="19" height="13" rx="2" /><path d="M2.5 10h19M6 15h4" /></svg>
          Financeiro
        </RouterLink>
        <RouterLink :to="{ name: 'admin-inventory' }">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9.5 12 4l9 5.5V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" /><path d="M8 21v-7h8v7" /></svg>
          Estoque
        </RouterLink>
        <RouterLink v-if="auth.user?.role === 'ADMIN'" :to="{ name: 'admin-users' }">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16.5 5.5a3.2 3.2 0 0 1 0 6.4M21.5 20a6 6 0 0 0-5-6.2" /></svg>
          Usuários
        </RouterLink>
      </nav>
    </header>

    <main class="container admin__content">
      <RouterView v-slot="{ Component, route: viewRoute }">
        <Transition :name="transitionName" mode="out-in">
          <component :is="Component" :key="viewRoute.path" />
        </Transition>
      </RouterView>
    </main>

    <footer class="admin__footer">
      <div class="container admin__footer-inner">
        <RouterLink to="/" class="admin__footer-brand">
          <img src="/brand/logo-noely-cerqueira.png" alt="Noely Cerqueira" />
        </RouterLink>
        <span class="admin__footer-copy">© {{ new Date().getFullYear() }} Noely Cerqueira — Painel administrativo</span>
        <RouterLink to="/" class="admin__footer-link">
          Ver site público
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </RouterLink>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.admin {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--color-surface-muted);
}

.admin__topbar {
  position: sticky;
  top: 0;
  z-index: 40;
  background: linear-gradient(180deg, var(--color-surface) 0%, var(--color-bg) 160%);
  border-bottom: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
}

.admin__topbar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-5);
  padding: var(--space-4) var(--space-5) var(--space-3);
}

.admin__brand {
  display: flex;
  align-items: center;
  transition: opacity var(--duration-fast) var(--ease-standard), transform var(--duration-base) var(--ease-premium);
}

.admin__brand:hover {
  opacity: 0.75;
  transform: scale(1.02);
}

.admin__brand img {
  height: 56px;
  width: auto;
  transition: height var(--duration-base) var(--ease-premium);
}

.admin__brand-divider {
  width: 1px;
  height: 32px;
  margin-inline: var(--space-4);
  background: var(--color-border);
  flex-shrink: 0;
}

.admin__brand-title {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.25;
  color: var(--color-rose-900);
  letter-spacing: 0.01em;
}

/* Abaixo de 640px não sobra largura para logo + divisor + título de duas
   linhas ao lado da pílula de função e do botão Sair sem colidir (testado:
   colidia de verdade, não só "parecia apertado") — mantém só a logo, igual
   já era antes deste título existir. */
@media (max-width: 640px) {
  .admin__brand-divider,
  .admin__brand-title {
    display: none;
  }

  .admin__brand img {
    height: 40px;
  }
}

.admin__nav {
  position: relative;
  display: flex;
  gap: var(--space-2);
  font-weight: 600;
  color: var(--color-ink-muted);
  padding: 0 var(--space-5) var(--space-3);
  overflow-x: auto;
  scrollbar-width: none;
}

.admin__nav::-webkit-scrollbar {
  display: none;
}

.admin__nav-indicator {
  position: absolute;
  top: 0;
  left: 0;
  background: linear-gradient(135deg, var(--color-rose-700), var(--color-rose-900));
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-sm);
  z-index: 0;
}

.admin__nav > a {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex-shrink: 0;
  padding: 9px 18px;
  border-radius: var(--radius-pill);
  white-space: nowrap;
  transition: color var(--duration-base) var(--ease-premium), transform var(--duration-base) var(--ease-premium);
}

.admin__nav > a svg {
  opacity: 0.7;
  transition: opacity var(--duration-fast) var(--ease-standard);
}

.admin__nav > a:hover {
  color: var(--color-rose-700);
  transform: translateY(-1px);
}

.admin__nav > a:hover svg,
.admin__nav > a.router-link-exact-active svg {
  opacity: 1;
}

.admin__nav > a:active {
  transform: translateY(0) scale(0.97);
}

/* -exact-active (não -active): -active é por prefixo de path, e "Painel"
   resolve para /admin, que é prefixo de toda sub-rota do painel — pelo
   -active normal, "Painel" ficaria branco (como se estivesse selecionado)
   em QUALQUER página do painel, não só na home dele. Ver também o mesmo
   raciocínio em syncIndicator() no script acima. */
.admin__nav a.router-link-exact-active {
  color: #fff;
}

.admin__nav a.router-link-exact-active:hover {
  color: #fff;
}

.admin__account {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex-shrink: 0;
}

.admin__user {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 0.85rem;
  color: var(--color-ink);
  font-weight: 600;
  line-height: 1.3;
}

.admin__role {
  align-self: flex-end;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-rose-700);
  background: var(--color-rose-100);
  padding: 2px 9px;
  border-radius: var(--radius-pill);
  margin-top: 2px;
}

.admin__logout {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: 1px solid var(--color-rose-300);
  color: var(--color-rose-900);
  padding: 8px 16px;
  border-radius: var(--radius-pill);
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: border-color var(--duration-base) var(--ease-premium), background var(--duration-base) var(--ease-premium), transform var(--duration-base) var(--ease-premium);
}

.admin__logout:hover {
  border-color: var(--color-rose-700);
  background: var(--color-rose-100);
  transform: translateY(-2px);
}

.admin__logout:active {
  transform: translateY(0) scale(0.96);
}

.admin__content {
  flex: 1;
  overflow-x: clip;
  padding-block: var(--space-6) var(--space-9);
}

.admin__footer {
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
}

.admin__footer-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  padding-block: var(--space-4);
  text-align: center;
}

.admin__footer-brand img {
  height: 22px;
  width: auto;
  opacity: 0.7;
  filter: grayscale(0.3);
  transition: opacity var(--duration-fast) var(--ease-standard);
}

.admin__footer-brand:hover img {
  opacity: 1;
}

.admin__footer-copy {
  font-size: 0.82rem;
  color: var(--color-ink-soft);
}

.admin__footer-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-rose-700);
  transition: gap var(--duration-fast) var(--ease-standard);
}

.admin__footer-link:hover {
  gap: 8px;
}

@media (min-width: 780px) {
  .admin__footer-inner {
    justify-content: space-between;
    text-align: left;
  }
}

@media (min-width: 900px) {
  .admin__topbar-row {
    padding-bottom: var(--space-3);
  }
}

/* Troca de aba do painel (Painel/Serviços/Agenda/Financeiro/Estoque/
   Usuários): sem isso, o conteúdo trocava de uma vez, sem transição nenhuma
   — a pílula da nav deslizava (ver syncIndicator no script) mas a área de
   conteúdo abaixo simplesmente "piscava" para o próximo componente.
   Direcional (ver NAV_ORDER/transitionName no script): o conteúdo novo entra
   pelo lado de onde "viria" na ordem visual das abas — indo de Agenda para
   Financeiro (mais à direita na nav) desliza da direita; voltando de
   Financeiro para Agenda desliza da esquerda.

   Saída BEM mais rápida que a entrada de propósito (0.16s vs 0.34s): com
   mode="out-in", a view nova (com seu próprio LoadingState, já que cada aba
   recarrega os dados do zero) só monta depois que a saída termina — uma
   saída lenta só alonga à toa o intervalo em que a tela fica com pouco
   conteúdo (o motivo do "parece que ficou em branco" antes). Sem filter:blur
   também de propósito: blur animado é uma das poucas propriedades CSS que
   nem sempre compõe bem na GPU em todo navegador/driver — em alguns cenários
   isso pode piscar ou "engasgar" um frame, o que ironicamente reforça a
   sensação de tela quebrada que este ajuste tenta resolver. */
.admin-tab-forward-enter-active,
.admin-tab-back-enter-active {
  transition: opacity 0.34s var(--ease-premium), transform 0.34s var(--ease-premium);
}

.admin-tab-forward-leave-active,
.admin-tab-back-leave-active {
  transition: opacity 0.16s var(--ease-standard), transform 0.16s var(--ease-standard);
}

.admin-tab-forward-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.admin-tab-forward-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}

.admin-tab-back-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}

.admin-tab-back-leave-to {
  opacity: 0;
  transform: translateX(12px);
}

@media (prefers-reduced-motion: reduce) {
  .admin-tab-forward-enter-active,
  .admin-tab-forward-leave-active,
  .admin-tab-back-enter-active,
  .admin-tab-back-leave-active {
    transition: none;
  }
}
</style>
