<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { Flip, gsap, prefersReducedMotion } from '@/lib/motion';
import { applyMagneticButtons } from '@/composables/useMagneticButton';
import { useAuthStore } from '@/stores/auth';
import { nowInClinicTimezone } from '@/utils/calendar';
import { fetchDashboardStats } from '@/services/admin-dashboard.service';
import type { DashboardStats } from '@/types';
import DecorativeDots from '@/components/DecorativeDots.vue';
import AdminCommandPalette from '@/components/admin/AdminCommandPalette.vue';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

// Tira de estatísticas ao vivo no topo — ilustrativa E útil: números reais
// (nunca projeção) visíveis em QUALQUER aba do painel, não só na Home dele.
// Busca uma vez só ao montar (não a cada troca de aba — o topo não recarrega
// entre abas, ver o fix de :key em App.vue): o valor pode ficar levemente
// desatualizado se algo mudar em outra aba na mesma sessão, aceitável pra um
// resumo "de relance", não um dado crítico de decisão. Falha em silêncio de
// propósito — se a chamada falhar, a tira simplesmente não aparece, nunca
// atrapalha o resto do painel funcionar.
const quickStats = ref<DashboardStats | null>(null);
async function loadQuickStats() {
  try {
    quickStats.value = await fetchDashboardStats(7);
  } catch {
    quickStats.value = null;
  }
}
function formatQuickCurrency(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

// Iniciais pro avatar do usuário no topo — "Noely Cerqueira" → "NC", um
// nome só → só a primeira letra. Puramente ilustrativo (o painel não tem
// upload de foto de perfil ainda), mas já é bem mais pessoal que só texto.
const userInitials = computed(() => {
  const name = auth.user?.name?.trim();
  if (!name) return '';
  const parts = name.split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase() : parts[0].slice(0, 2).toUpperCase();
});

// Saudação por horário (mesmo helper de fuso da clínica já usado no
// indicador "aberto agora" da página de Contato — nunca a hora local do
// dispositivo de quem está logado, embora aqui a diferença raramente
// importe já que é a equipe da própria clínica acessando). Primeiro nome
// só: "Bom dia, Noely" lê melhor no espaço apertado do topo do que o nome
// completo duas vezes (já aparece por extenso logo abaixo, no bloco da
// conta).
const greeting = computed(() => {
  const { minutes } = nowInClinicTimezone();
  if (minutes < 12 * 60) return 'Bom dia';
  if (minutes < 18 * 60) return 'Boa tarde';
  return 'Boa noite';
});
const firstName = computed(() => auth.user?.name?.trim().split(/\s+/)[0] ?? '');

const nav = ref<HTMLElement | null>(null);
const indicator = ref<HTMLElement | null>(null);

// Ordem visual das abas (esquerda → direita na nav) — usada só para decidir
// a DIREÇÃO da transição entre views, não a navegação em si. Indo para uma
// aba mais à direita, o conteúdo novo entra vindo da direita (como se
// estivesse "adiante" na fila); indo para uma mais à esquerda, entra vindo
// da esquerda. Sem isso, toda troca de aba tinha a mesma animação genérica
// independente de para onde o usuário estava realmente navegando.
const NAV_ORDER = ['admin-dashboard', 'admin-catalog', 'admin-agenda', 'admin-patients', 'admin-patient-detail', 'admin-finance', 'admin-inventory', 'admin-users', 'admin-audit'];
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
  // A pílula é position:absolute DENTRO da própria nav (que tem
  // overflow-x:auto) — ou seja, ela rola junto com o conteúdo, igual ao
  // link. getBoundingClientRect() já vem líquido do scroll atual (é
  // relativo ao viewport), então "linkRect.left - navRect.left" dá só o
  // deslocamento visível NAQUELE instante, não a posição real dentro do
  // conteúdo rolável. Resultado: toda vez que a nav já estava rolada no
  // momento do cálculo (ou seja, sempre a partir da 2ª sincronização em
  // diante — troca de aba, resize, rotação de tela), o scroll era
  // descontado uma segunda vez na hora de renderizar (a pílula também rola
  // com o conteúdo), e o desvio ia se acumulando a cada recálculo. Somar
  // nav.scrollLeft de volta devolve a posição verdadeira dentro do
  // conteúdo, que é o que o transform precisa carregar.
  const x = linkRect.left - navRect.left + nav.value.scrollLeft;
  const y = linkRect.top - navRect.top;
  indicator.value.style.width = `${linkRect.width}px`;
  indicator.value.style.height = `${linkRect.height}px`;
  indicator.value.style.transform = `translate(${x}px, ${y}px)`;

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

// A pílula ativa é posicionada com um transform em pixels calculado uma vez
// (na troca de rota) — sem isso, ela fica "grudada" nas coordenadas antigas
// sempre que o layout da nav muda de tamanho sem trocar de rota: rotação de
// tela no celular, teclado abrindo/fechando, ou a barra de endereço do
// navegador mobile recolhendo/expandindo ao rolar (todos comuns, nenhum
// dispara o watch de rota) — resultado visto em produção era a pílula
// aparecer "quebrada", flutuando sobre uma aba errada. ResizeObserver na nav
// resolve isso recalculando sempre que as dimensões dela mudam, não só
// quando a rota muda.
let resizeObserver: ResizeObserver | null = null;
let resizeDebounce: ReturnType<typeof setTimeout> | undefined;

onMounted(() => {
  syncIndicator();
  // Mesma cautela do AppHeader.vue contra o carregamento "a frio": garante
  // que a pílula recalcula depois que o router confirma a navegação
  // inicial (chunk async da view filha incluído), mesmo que nextTick() já
  // tenha sido suficiente na maioria dos casos aqui.
  router.isReady().then(syncIndicator);
  prefetchOtherTabs();
  loadQuickStats();
  playTopbarIntro();

  if (nav.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      // Debounced: rotação de tela e a barra do navegador mobile recolhendo
      // costumam disparar várias entradas do ResizeObserver em sequência
      // rápida — sem isso, cada uma tocaria a animação Flip da pílula de
      // novo, um efeito visual estranho de "tremida" em vez de um
      // reposicionamento único e suave.
      clearTimeout(resizeDebounce);
      resizeDebounce = setTimeout(syncIndicator, 120);
    });
    resizeObserver.observe(nav.value);
  }
});

onUnmounted(() => resizeObserver?.disconnect());

// Entrada do topo inteiro na primeira vez que o painel monta — só na
// primeira vez mesmo: graças ao fix de :key em App.vue (a rota-mãe /admin é
// a key, não o path completo), o AdminLayout agora fica montado UMA SÓ VEZ
// pra toda a sessão de painel, trocando só o conteúdo interno entre abas —
// então este onMounted só roda ao entrar no painel (login ou refresh), não
// a cada clique de aba, exatamente onde uma entrada chamativa faz sentido
// (repetir isso em toda troca de aba seria cansativo, não elegante).
function playTopbarIntro() {
  if (prefersReducedMotion()) return;
  const brand = document.querySelector('.admin__brand');
  const account = document.querySelector('.admin__account');
  const navLinks = document.querySelectorAll('.admin__nav > a');
  if (!brand) return;

  const tl = gsap.timeline({ defaults: { ease: 'premium-out' } });
  tl.fromTo(brand, { opacity: 0, y: -10, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.55 })
    .fromTo(account, { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 0.45 }, 0.1)
    .fromTo(navLinks, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.05 }, 0.2);
}

// Cada aba do painel (Painel/Serviços/Agenda/Financeiro/Estoque/Usuários) é
// um chunk JS separado (import() dinâmico, ver router/index.ts) — na
// primeira visita a uma aba dentro da sessão, o navegador precisa BAIXAR
// esse chunk antes do <Transition> sequer poder começar a animar, o que lia
// como "a tela fica totalmente branca" (não era a transição em si, que já
// está bem ajustada logo abaixo — era a ausência total de qualquer
// componente montado enquanto o import() ainda estava em voo). Como o
// painel inteiro é pequeno (ferramenta interna, não o site público), o
// custo de baixar as 5 abas restantes de uma vez é desprezível — assim que
// o usuário realmente clica em outra aba, o chunk já está no cache do
// import() do Vite/navegador e a transição roda imediatamente, sem gap.
function prefetchOtherTabs() {
  import('@/views/admin/AdminDashboardView.vue');
  import('@/views/admin/AdminCatalogView.vue');
  import('@/views/admin/AdminAgendaView.vue');
  import('@/views/admin/AdminPatientsView.vue');
  import('@/views/admin/AdminFinanceView.vue');
  import('@/views/admin/AdminInventoryView.vue');
  if (auth.user?.role === 'ADMIN') {
    import('@/views/admin/AdminUsersView.vue');
    import('@/views/admin/AdminAuditView.vue');
  }
}

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
      <DecorativeDots :count="10" />
      <span class="admin__topbar-glow" aria-hidden="true" />

      <div class="admin__topbar-row">
        <RouterLink to="/" class="admin__brand">
          <span class="admin__brand-mark">
            <span class="admin__brand-ring" aria-hidden="true" />
            <span class="admin__brand-sparkle admin__brand-sparkle--1" aria-hidden="true">✦</span>
            <span class="admin__brand-sparkle admin__brand-sparkle--2" aria-hidden="true">✦</span>
            <img src="/brand/logo-noely-cerqueira.png" alt="Noely Cerqueira" />
          </span>
          <span class="admin__brand-divider" aria-hidden="true" />
          <!-- Saudação dinâmica no lugar do rótulo estático "Painel
               Administrativo" — o resto da tela já deixa claro onde a
               pessoa está (h1 de cada aba, o próprio menu ali embaixo);
               aqui no topo, um "Bom dia, Noely" tem mais valor do que
               repetir o nome da ferramenta. Cai de volta pro rótulo fixo
               só no instante entre montar e auth.user resolver (login
               "a frio"/refresh), pra nunca mostrar um espaço vazio. -->
          <span class="admin__brand-title">
            <template v-if="auth.user">{{ greeting }},<br />{{ firstName }}</template>
            <template v-else>Painel<br />Administrativo</template>
          </span>
        </RouterLink>

        <div class="admin__account">
          <AdminCommandPalette />
          <span v-if="auth.user" class="admin__user">
            <span class="admin__user-text">
              {{ auth.user.name }}
              <span class="admin__role" :class="{ 'admin__role--admin': auth.user.role === 'ADMIN' }">
                <svg v-if="auth.user.role === 'ADMIN'" viewBox="0 0 24 24" width="10" height="10" fill="currentColor" stroke="none" aria-hidden="true"><path d="M3 17h18l-1.5-9-4.5 4L12 5 9 12l-4.5-4L3 17Z" /></svg>
                {{ auth.user.role === 'ADMIN' ? 'Administrador' : 'Recepção' }}
              </span>
            </span>
            <span class="admin__avatar-wrap">
              <span class="admin__avatar" aria-hidden="true">{{ userInitials }}</span>
              <span class="admin__avatar-status" aria-hidden="true" />
            </span>
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

      <!-- Tira de estatísticas ao vivo: dados reais (nunca projeção),
           visíveis em QUALQUER aba do painel — não só quando "Painel" está
           aberto. Cada pílula é um ATALHO de verdade (RouterLink pra aba
           relacionada), não só leitura — clicar em "estoque baixo" já leva
           pra Estoque, sem precisar caçar a aba certa na nav. Só a partir
           de 900px (ver media query abaixo): no celular a nav de abas já
           disputa espaço, mais uma linha de números aqui viraria poluição
           visual antes de virar utilidade. -->
      <Transition name="fade-swap">
      <div v-if="quickStats" class="admin__quickstats">
        <RouterLink :to="{ name: 'admin-agenda' }" class="admin__quickstat">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
          <strong>{{ quickStats.appointmentsToday }}</strong> agendamento(s) hoje
        </RouterLink>
        <RouterLink :to="{ name: 'admin-finance' }" class="admin__quickstat">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8M15 7h6v6" /></svg>
          <strong>{{ formatQuickCurrency(quickStats.revenueThisMonthCents) }}</strong> receita do mês
        </RouterLink>
        <RouterLink
          v-if="quickStats.lowStockCount > 0"
          :to="{ name: 'admin-inventory' }"
          class="admin__quickstat admin__quickstat--warning"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
          <strong>{{ quickStats.lowStockCount }}</strong> item(ns) com estoque baixo
        </RouterLink>
      </div>
      </Transition>

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
        <RouterLink :to="{ name: 'admin-patients' }">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16.5 5.5a3.2 3.2 0 0 1 0 6.4M21.5 20a6 6 0 0 0-5-6.2" /></svg>
          Pacientes
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
        <RouterLink v-if="auth.user?.role === 'ADMIN'" :to="{ name: 'admin-audit' }">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
          Auditoria
        </RouterLink>
      </nav>
    </header>

    <main class="container admin__content">
      <div class="admin__view-stack">
        <RouterView v-slot="{ Component, route: viewRoute }">
          <Transition :name="transitionName">
            <component :is="Component" :key="viewRoute.path" />
          </Transition>
        </RouterView>
      </div>
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

/* --- Topo do painel: overhaul visual (era um gradiente liso + logo + nav,
   sem nenhum detalhe ilustrativo próprio da marca) ---
   overflow:hidden contém o brilho ambiente (.admin__topbar-glow) e a poeira
   decorativa (DecorativeDots, mesmo componente usado no site público) sem
   vazar por cima da página abaixo; position:sticky já bastava como
   containing block pros dois, position:relative implícito nela não muda. */
.admin__topbar {
  position: sticky;
  top: 0;
  z-index: 40;
  overflow: hidden;
  background: linear-gradient(180deg, var(--color-surface) 0%, var(--color-bg) 160%);
  border-bottom: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
}

/* Brilho ambiente sutil (mesma técnica de .hero__glow/.cta-final__glow no
   site público) — dá ao topo uma presença de marca em vez de só uma faixa
   utilitária lisa. Fixo (sem animação): já é um painel de trabalho, um
   glow ANIMADO no topo da tela o tempo todo seria distração, não charme. */
.admin__topbar-glow {
  position: absolute;
  top: -60%;
  left: 55%;
  width: min(640px, 80vw);
  height: 220%;
  background: radial-gradient(ellipse at center, rgba(185, 124, 127, 0.14), transparent 68%);
  pointer-events: none;
  z-index: 0;
}

.admin__topbar-row {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-5);
  padding: var(--space-4) var(--space-5) var(--space-3);
}

.admin__brand {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  transition: opacity var(--duration-fast) var(--ease-standard), transform var(--duration-base) var(--ease-premium);
}

.admin__brand:hover {
  opacity: 0.85;
  transform: scale(1.02);
}

.admin__brand-mark {
  position: relative;
  display: inline-flex;
  align-items: center;
}

/* Anel pontilhado girando bem devagar ao redor da logo — mesma assinatura
   visual já usada no anel dourado do hero (site público) e nos cards da
   página de Contato: um oval (border-radius:50% sobre uma caixa larga, não
   o círculo/blob usado em ícones quase quadrados) porque a logo aqui é um
   lockup largo (monograma + nome), não um ícone. */
.admin__brand-ring {
  position: absolute;
  inset: -8px -20px;
  border: 1.5px dashed var(--color-gold-500);
  border-radius: 50%;
  opacity: 0.45;
  animation: admin-brand-ring-spin 32s linear infinite;
  transition: opacity var(--duration-base) var(--ease-standard);
}

.admin__brand:hover .admin__brand-ring {
  opacity: 0.85;
}

@keyframes admin-brand-ring-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .admin__brand-ring {
    animation: none;
  }
}

/* Sparkles dourados — mesmo glifo/flutuação do hero do site público e do
   card de Instagram em Contato, replicados aqui numa escala discreta pra
   não competir com o resto do topo (é a área mais "sempre visível" de todo
   o painel, um brilho grande demais cansaria rápido). */
.admin__brand-sparkle {
  position: absolute;
  color: var(--color-gold-500);
  pointer-events: none;
  animation: admin-brand-sparkle-float 5s ease-in-out infinite;
}

.admin__brand-sparkle--1 {
  top: -6px;
  right: -14px;
  font-size: 0.85rem;
}

.admin__brand-sparkle--2 {
  bottom: 2px;
  left: -16px;
  font-size: 0.6rem;
  animation-delay: 1.8s;
}

@keyframes admin-brand-sparkle-float {
  0%, 100% {
    transform: translateY(0) scale(1);
    opacity: 0.6;
  }
  50% {
    transform: translateY(-5px) scale(1.15);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .admin__brand-sparkle {
    animation: none;
  }
}

.admin__brand img {
  /* Aumentada de novo a pedido explícito do cliente (era 56px, depois 72px)
     — praticamente do tamanho do header do site público (96px) agora, sem
     mais tentar "economizar" hierarquia visual por conta própria. */
  height: 92px;
  width: auto;
  flex-shrink: 0;
  position: relative;
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
    height: 56px;
  }
}

/* Tira de estatísticas ao vivo (ver quickStats no script) — escondida
   abaixo de 900px de propósito: no celular a nav de abas já briga por
   espaço horizontal, mais uma linha de números aqui virava poluição antes
   de virar utilidade. */
.admin__quickstats {
  display: none;
}

@media (min-width: 900px) {
  .admin__quickstats {
    position: relative;
    z-index: 1;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    padding: 0 var(--space-5) var(--space-3);
  }
}

/* São RouterLink agora (ver template) — atalho de verdade pra aba
   relacionada, não só leitura. cursor/hover/active abaixo existem pra isso
   ficar óbvio ao passar o mouse, do contrário a pílula lia como um badge
   estático igual antes, escondendo que agora é clicável. */
.admin__quickstat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  color: var(--color-ink-muted);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  padding: 5px 12px;
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard);
}

.admin__quickstat:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
  border-color: var(--color-rose-300);
}

.admin__quickstat:active {
  transform: translateY(0) scale(0.97);
}

.admin__quickstat svg {
  flex-shrink: 0;
  color: var(--color-rose-500);
}

.admin__quickstat strong {
  font-weight: 700;
  color: var(--color-ink);
}

.admin__quickstat--warning {
  border-color: color-mix(in srgb, var(--color-danger) 35%, var(--color-border));
  background: color-mix(in srgb, var(--color-danger) 6%, var(--color-surface));
}

.admin__quickstat--warning:hover {
  border-color: var(--color-danger);
}

.admin__quickstat--warning svg,
.admin__quickstat--warning strong {
  color: var(--color-danger);
}

.admin__nav {
  position: relative;
  z-index: 1;
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
  min-height: var(--touch-target-min);
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
  align-items: center;
  gap: var(--space-3);
}

.admin__user-text {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 0.85rem;
  color: var(--color-ink);
  font-weight: 600;
  line-height: 1.3;
}

/* Avatar de iniciais — puramente ilustrativo (sem upload de foto ainda),
   mesma ideia do avatar "NC" da prévia de conversa do card de WhatsApp na
   página de Contato: dá uma presença pessoal ao "quem está logado" em vez
   de só texto alinhado à direita. */
.admin__avatar-wrap {
  position: relative;
  flex-shrink: 0;
}

.admin__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-rose-700), var(--color-rose-900));
  color: #fff;
  font-family: var(--font-display);
  font-size: 0.95rem;
  font-weight: 700;
  box-shadow: var(--shadow-sm);
}

/* Pontinho "sessão ativa" — mesma linguagem visual do indicador "aberto
   agora" da página de Contato, só que aqui é sempre verde: enquanto o
   avatar está na tela, é porque a sessão realmente está ativa (não há como
   estar vendo o painel deslogado), então não precisa de dois estados. */
.admin__avatar-status {
  position: absolute;
  bottom: -1px;
  right: -1px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-success);
  border: 2px solid var(--color-surface);
  animation: admin-avatar-pulse 2.4s ease-in-out infinite;
}

@keyframes admin-avatar-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(79, 122, 92, 0.45);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(79, 122, 92, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .admin__avatar-status {
    animation: none;
  }
}

@media (max-width: 640px) {
  .admin__user-text {
    display: none;
  }
}

.admin__role {
  display: inline-flex;
  align-items: center;
  gap: 3px;
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

/* Coroa só na badge de ADMIN (não Recepção) — reforça a hierarquia de
   papéis de relance, sem precisar ler o texto. */
.admin__role--admin {
  color: var(--color-gold-700);
  background: var(--color-gold-100);
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

/* Wrapper SEM padding próprio, só pra ancorar o elemento que está SAINDO
   durante a troca de aba (ver .admin-tab-forward-leave-active/back mais
   abaixo, que vira position:absolute; top:0; left:0). Não dá pra usar
   .admin__content direto como âncora: ele (via .container) tem
   padding-inline/padding-block, e top:0/left:0 de um filho absoluto
   alinham com a borda do PADDING do ancestral, não com onde o padding
   "empurra" o conteúdo normal — o elemento saindo ficaria desalinhado do
   que está entrando, deslocado exatamente pela distância do padding. Este
   wrapper sem padding nenhum faz os dois (saindo/entrando) ocuparem
   fisicamente o mesmo retângulo. */
.admin__view-stack {
  position: relative;
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

   HISTÓRICO (pra quem for mexer aqui de novo — confirmado gravando a troca
   quadro a quadro via Playwright, screenshot a cada 40ms, porque um flash de
   ~100ms é rápido demais pro olho isolar a causa raiz sozinho):

   1ª causa: mode="out-in" no <Transition> — a view antiga precisava
   desmontar por completo antes da nova sequer montar. Removido.

   2ª causa: mesmo sem mode, as duas views faziam CROSSFADE DE OPACIDADE (a
   que entra de 0→1, a que sai de 1→0) — no meio da troca as duas ficavam
   parcialmente transparentes ao mesmo tempo, e a soma visual de duas
   camadas de conteúdo cheio desbotando lia como um borrão claro,
   indistinguível de "tela branca". Tentativa de correção: só a que ENTRA
   anima, a que SAI some instantânea. Ainda não bastou —

   3ª causa (a de verdade): mesmo só a view que entra animando, ela ainda
   começava em opacity:0 e subia gradualmente — e como a antiga já tinha
   sumido no mesmo instante, sobrava uma janela real (não visual, real
   mesmo) em que NADA na tela estava opaco o suficiente pra ler como
   conteúdo, só o fundo liso do painel por trás. Qualquer fade-in a partir
   de opacity:0 tem esse problema, sozinho ou não.

   A CORREÇÃO DEFINITIVA: nunca deixar a opacidade cair — só `transform`
   anima. A view que entra já nasce 100% opaca (só levemente deslocada,
   ~24px) e desliza pro lugar; como opacity nunca sai de 1, o conteúdo está
   sempre legível desde o primeiro frame, só fisicamente se movendo. A que
   sai continua sumindo instantaneamente (sem transition-duration própria),
   position:absolute só pra não empurrar layout no instante em que as duas
   coexistem.

   Sem filter:blur de propósito: blur animado é uma das poucas propriedades
   CSS que nem sempre compõe bem na GPU em todo navegador/driver — em alguns
   cenários isso pode piscar ou "engasgar" um frame. */
.admin-tab-forward-enter-active,
.admin-tab-back-enter-active {
  transition: transform 0.26s var(--ease-premium);
}

.admin-tab-forward-leave-active,
.admin-tab-back-leave-active {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
}

.admin-tab-forward-enter-from {
  transform: translateX(24px);
}

.admin-tab-back-enter-from {
  transform: translateX(-24px);
}

@media (prefers-reduced-motion: reduce) {
  .admin-tab-forward-enter-active,
  .admin-tab-back-enter-active {
    transition: none;
  }
}
</style>
