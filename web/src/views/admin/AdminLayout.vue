<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { Flip, gsap, prefersReducedMotion, SplitText, supportsFinePointer } from '@/lib/motion';
import { giveMasksRoom } from '@/composables/useSplitReveal';
import { useAuthStore } from '@/stores/auth';
import { nowInClinicTimezone } from '@/utils/calendar';
import { fetchDashboardStats } from '@/services/admin-dashboard.service';
import type { DashboardStats } from '@/types';
import AdminCommandPalette from '@/components/admin/AdminCommandPalette.vue';
import { animateViewTitle, installAdminMotion } from '@/composables/useAdminMotion';

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

// "segunda-feira, 2 de novembro" — no fuso da clínica, como a saudação.
const todayLabel = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'America/Bahia',
}).format(new Date());

// Brilho dourado que percorre a logo (ver .admin__brand-shine): uma faixa
// de luz em background-position, recortada pela máscara com o próprio PNG.
// Toca na entrada do painel e de novo a cada hover, sem empilhar se o
// mouse entrar e sair rápido (overwrite).
const shine = ref<HTMLElement | null>(null);
function shineLogo() {
  if (prefersReducedMotion() || !shine.value) return;
  gsap.fromTo(
    shine.value,
    { backgroundPosition: '-60% 0' },
    { backgroundPosition: '160% 0', duration: 1.1, ease: 'premium-in-out', overwrite: true },
  );
}

// Pílula de hover: uma segunda pílula, clarinha, que DESLIZA até a aba sob
// o mouse (em vez de cada link acender sozinho) — a pílula escura continua
// marcando a aba ativa. Um listener só na nav (delegação), quickTo porque
// mouseover dispara muito ao passar de link em link.

const nav = ref<HTMLElement | null>(null);
const indicator = ref<HTMLElement | null>(null);

// Ordem visual das abas (esquerda → direita na nav) — usada só para decidir
// a DIREÇÃO da transição entre views, não a navegação em si. Indo para uma
// aba mais à direita, o conteúdo novo entra vindo da direita (como se
// estivesse "adiante" na fila); indo para uma mais à esquerda, entra vindo
// da esquerda. Sem isso, toda troca de aba tinha a mesma animação genérica
// independente de para onde o usuário estava realmente navegando.
const NAV_ORDER = ['admin-dashboard', 'admin-agenda', 'admin-patients', 'admin-patient-detail', 'admin-catalog', 'admin-finance', 'admin-inventory', 'admin-users', 'admin-whatsapp', 'admin-schedule', 'admin-audit'];
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
  const state = Flip.getState(indicator.value);
  // offsetLeft/offsetTop (relativos à nav, que é o offsetParent) em vez de
  // getBoundingClientRect: ignoram transforms, então a medida não pega os
  // links no meio da animação de entrada da topbar (a pílula ficava
  // deslocada para baixo na primeira carga) e já descontam o scroll da nav.
  const linkRect = { width: link.offsetWidth, height: link.offsetHeight };
  const x = link.offsetLeft;
  const y = link.offsetTop;
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
  // Sub-rotas sem aba própria (a ficha /admin/pacientes/:id é rota irmã da
  // lista, não filha, então o router não marca a aba) caem na aba cujo
  // caminho é prefixo do atual, excluindo o Painel (/admin, prefixo de tudo).
  const links = Array.from(nav.value?.querySelectorAll<HTMLAnchorElement>('a') ?? []);
  const activeLink =
    links.find((a) => a.classList.contains('router-link-exact-active')) ??
    links.find((a) => {
      const href = a.getAttribute('href') ?? '';
      return href !== '/admin' && route.path.startsWith(`${href}/`);
    });
  moveIndicatorTo(activeLink ?? null);
  activeLink?.scrollIntoView({ block: 'nearest', inline: 'nearest' });

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

// Movimento de fábrica de todas as abas (ver useAdminMotion.ts): cartões
// revelados ao aparecer, brilho que segue o mouse e o título da aba
// subindo palavra por palavra a cada troca.
const content = ref<HTMLElement | null>(null);
let uninstallMotion: (() => void) | null = null;
onMounted(() => {
  if (content.value) uninstallMotion = installAdminMotion(content.value);
  router.isReady().then(() => requestAnimationFrame(() => animateViewTitle(content.value?.querySelector('.admin__view-stack > :last-child') ?? null)));
});
onUnmounted(() => uninstallMotion?.());
watch(
  () => route.path,
  async () => {
    await nextTick();
    requestAnimationFrame(() => animateViewTitle(content.value?.querySelector('.admin__view-stack > :last-child') ?? null));
  },
);

// Entrada do topo inteiro na primeira vez que o painel monta — só na
// primeira vez mesmo: graças ao fix de :key em App.vue (a rota-mãe /admin é
// a key, não o path completo), o AdminLayout agora fica montado UMA SÓ VEZ
// pra toda a sessão de painel, trocando só o conteúdo interno entre abas —
// então este onMounted só roda ao entrar no painel (login ou refresh), não
// a cada clique de aba, exatamente onde uma entrada chamativa faz sentido
// (repetir isso em toda troca de aba seria cansativo, não elegante).
// Sequência: a logo se abre da esquerda para a direita (clip-path),
// o brilho dourado percorre os traços, a saudação
// sobe palavra por palavra, e só então conta, chips e abas assentam.
let greetingSplit: SplitText | null = null;
function playTopbarIntro() {
  if (prefersReducedMotion()) return;
  const logo = document.querySelector('.admin__brand-mark img');
  const title = document.querySelector<HTMLElement>('.admin__brand-title');
  const date = document.querySelector('.admin__brand-date');
  const divider = document.querySelector('.admin__brand-divider');
  const account = document.querySelector('.admin__account');
  const navLinks = document.querySelectorAll('.admin__nav > a');
  if (!logo) return;

  const tl = gsap.timeline({ defaults: { ease: 'premium-out' } });
  tl.fromTo(logo, { clipPath: 'inset(0% 100% 0% 0%)', scale: 0.96 }, { clipPath: 'inset(0% 0% 0% 0%)', scale: 1, duration: 0.9, clearProps: 'clipPath' }, 0)
    .add(shineLogo, 0.55)
    .fromTo(divider, { scaleY: 0 }, { scaleY: 1, duration: 0.6 }, 0.3);

  if (title) {
    greetingSplit = SplitText.create(title, { type: 'words', mask: 'words' });
    giveMasksRoom(greetingSplit);
    const split = greetingSplit;
    // Desfaz as máscaras ao terminar: elas cortavam o g/j/ç da saudação.
    tl.from(split.words, { yPercent: 110, duration: 0.8, stagger: 0.06, onComplete: () => split.revert() }, 0.35);
  }
  tl.fromTo(date, { opacity: 0, x: -8 }, { opacity: 1, x: 0, duration: 0.6 }, 0.6)
    .fromTo(account, { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 0.5 }, 0.2)
    .fromTo(navLinks, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.045 }, 0.4);
}

// Os números dos chips contam a partir de zero quando chegam (a busca é
// assíncrona — roda depois da entrada do topo, não junto dela).
watch(quickStats, async (stats) => {
  if (!stats || prefersReducedMotion()) return;
  await nextTick();
  const chips = document.querySelectorAll('.admin__quickstat');
  gsap.from(chips, { y: -8, scale: 0.94, duration: 0.6, stagger: 0.08, ease: 'back.out(2)', clearProps: 'transform' });
  document.querySelectorAll<HTMLElement>('.admin__quickstat [data-count]').forEach((el) => {
    const target = Number(el.dataset.value ?? 0);
    const counter = { value: 0 };
    gsap.to(counter, {
      value: target,
      duration: 1.1,
      ease: 'power2.out',
      onUpdate: () => {
        el.textContent = String(Math.round(counter.value));
      },
    });
  });
});

onUnmounted(() => greetingSplit?.revert());

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
    import('@/views/admin/AdminWhatsappView.vue');
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

// Modo escuro (padrão) ou claro, lembrado por aparelho. Vale só enquanto o
// painel está aberto: ao sair dele o site público volta ao claro.
const THEME_KEY = 'noely-admin-theme';
function readTheme(): 'dark' | 'light' {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}
const theme = ref<'dark' | 'light'>(readTheme());
watch(
  theme,
  (value) => {
    document.documentElement.dataset.theme = value;
    try {
      localStorage.setItem(THEME_KEY, value);
    } catch {
      // Navegação privada: segue só nesta visita.
    }
  },
  { immediate: true },
);
onUnmounted(() => delete document.documentElement.dataset.theme);
// Troca com um círculo do tema novo nascendo do botão e cobrindo a tela
// (View Transitions do navegador: fotografa a tela antiga e revela a nova
// por um clip-path circular). Navegador sem suporte ou com movimento
// reduzido: troca direta.
function toggleTheme(event: MouseEvent) {
  const next = theme.value === 'dark' ? 'light' : 'dark';
  const doc = document as Document & { startViewTransition?: (update: () => void) => { ready: Promise<void> } };
  if (!doc.startViewTransition || prefersReducedMotion()) {
    theme.value = next;
    return;
  }
  // Centro do botão (funciona também ao ativar pelo teclado, sem posição do mouse).
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const transition = doc.startViewTransition(() => {
    // O tema precisa estar aplicado quando esta função termina (o watch só
    // rodaria depois): aplica direto e o watch só confirma.
    document.documentElement.dataset.theme = next;
    theme.value = next;
  });
  transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 750, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' },
    );
  });
}

function onLogout() {
  auth.logout();
  router.push({ name: 'admin-login' });
}
</script>

<template>
  <div class="admin">
    <header class="admin__topbar">

      <div class="admin__topbar-row">
        <RouterLink to="/" class="admin__brand" @mouseenter="shineLogo">
          <span class="admin__brand-mark">
            <img src="/brand/logo-noely-cerqueira.png" alt="Noely Cerqueira" />
            <!-- Brilho dourado recortado no formato exato da logo (mask com
                 o próprio PNG): percorre só os traços do monograma e do
                 nome, nunca o fundo em volta. -->
            <span ref="shine" class="admin__brand-shine" aria-hidden="true" />
          </span>
          <span class="admin__brand-divider" aria-hidden="true" />
          <!-- Saudação dinâmica no lugar do rótulo estático "Painel
               Administrativo" — o resto da tela já deixa claro onde a
               pessoa está (h1 de cada aba, o próprio menu ali embaixo);
               aqui no topo, um "Bom dia, Noely" tem mais valor do que
               repetir o nome da ferramenta. Cai de volta pro rótulo fixo
               só no instante entre montar e auth.user resolver (login
               "a frio"/refresh), pra nunca mostrar um espaço vazio. -->
          <span class="admin__brand-text">
            <span class="admin__brand-title">
              <template v-if="auth.user">{{ greeting }}, <em>{{ firstName }}</em></template>
              <template v-else>Painel administrativo</template>
            </span>
            <span class="admin__brand-date">{{ todayLabel }}</span>
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
          <button
            type="button"
            class="admin__logout admin__theme"
            :aria-label="theme === 'dark' ? 'Usar modo claro' : 'Usar modo escuro'"
            :title="theme === 'dark' ? 'Modo claro' : 'Modo escuro'"
            @click="toggleTheme"
          >
            <Transition name="theme-icon" mode="out-in">
            <svg v-if="theme === 'dark'" key="sun" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2" /><path d="M12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2 12h2.2M19.8 12H22M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" /></svg>
            <svg v-else key="moon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" /></svg>
            </Transition>
          </button>
          <button type="button" class="admin__logout" @click="onLogout">
            <span>Sair</span>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </div>

      <div class="admin__navrow">
      <nav ref="nav" class="admin__nav" aria-label="Navegação do painel">
        <span ref="indicator" class="admin__nav-indicator" aria-hidden="true" />
        <span class="admin__nav-group">Atendimento</span>
        <RouterLink :to="{ name: 'admin-dashboard' }">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.2" /><rect x="14" y="3" width="7" height="5" rx="1.2" /><rect x="14" y="12" width="7" height="9" rx="1.2" /><rect x="3" y="16" width="7" height="5" rx="1.2" /></svg>
          Painel
        </RouterLink>
        <RouterLink :to="{ name: 'admin-agenda' }">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
          Agenda
        </RouterLink>
        <RouterLink :to="{ name: 'admin-patients' }">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16.5 5.5a3.2 3.2 0 0 1 0 6.4M21.5 20a6 6 0 0 0-5-6.2" /></svg>
          Pacientes
        </RouterLink>
        <span class="admin__nav-group">Clínica</span>
        <RouterLink :to="{ name: 'admin-catalog' }">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 12.5 12.5 20.5a2 2 0 0 1-2.83 0l-6.17-6.17a2 2 0 0 1 0-2.83L11.5 3.5H19a1.5 1.5 0 0 1 1.5 1.5Z" /><circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" /></svg>
          Serviços
        </RouterLink>
        <RouterLink :to="{ name: 'admin-finance' }">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="6" width="19" height="13" rx="2" /><path d="M2.5 10h19M6 15h4" /></svg>
          Financeiro
        </RouterLink>
        <RouterLink :to="{ name: 'admin-inventory' }">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9.5 12 4l9 5.5V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" /><path d="M8 21v-7h8v7" /></svg>
          Estoque
        </RouterLink>
        <RouterLink :to="{ name: 'admin-site' }">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 14l2.5 2.5L16 12" /></svg>
          Site
        </RouterLink>
        <span class="admin__nav-group" v-if="auth.user?.role === 'ADMIN'">Configurações</span>
        <RouterLink v-if="auth.user?.role === 'ADMIN'" :to="{ name: 'admin-users' }">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16.5 5.5a3.2 3.2 0 0 1 0 6.4M21.5 20a6 6 0 0 0-5-6.2" /></svg>
          Usuários
        </RouterLink>
        <RouterLink v-if="auth.user?.role === 'ADMIN'" :to="{ name: 'admin-whatsapp' }">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 20.5 5 16a8.5 8.5 0 1 1 3 3l-4.5 1.5Z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a3.5 3.5 0 0 1-2-2l.8-1-1-2Z" /></svg>
          WhatsApp
        </RouterLink>
        <RouterLink v-if="auth.user?.role === 'ADMIN'" :to="{ name: 'admin-schedule' }">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          Horários
        </RouterLink>
        <RouterLink v-if="auth.user?.role === 'ADMIN'" :to="{ name: 'admin-audit' }">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
          Auditoria
        </RouterLink>
      </nav>

      <!-- Tira de estatísticas ao vivo: dados reais (nunca projeção),
           visíveis em QUALQUER aba do painel — não só quando "Painel" está
           aberto. Cada pílula é um ATALHO de verdade (RouterLink pra aba
           relacionada), não só leitura. Divide a linha com as abas, à
           direita (antes ocupava uma faixa inteira só sua no topo); some
           abaixo de 1200px, onde as abas precisam da largura toda. -->
      <Transition name="fade-swap">
        <div v-if="quickStats" class="admin__quickstats">
          <RouterLink
            :to="{ name: 'admin-agenda' }"
            class="admin__quickstat"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
            <strong data-count :data-value="quickStats.appointmentsToday">{{ quickStats.appointmentsToday }}</strong>
            <span class="admin__quickstat-short">hoje</span>
            <span class="admin__quickstat-label">{{ quickStats.appointmentsToday === 1 ? 'agendamento hoje' : 'agendamentos hoje' }}</span>
          </RouterLink>
          <RouterLink
            :to="{ name: 'admin-finance' }"
            class="admin__quickstat"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8M15 7h6v6" /></svg>
            <strong>{{ formatQuickCurrency(quickStats.revenueThisMonthCents) }}</strong>
            <span class="admin__quickstat-short">no mês</span>
            <span class="admin__quickstat-label">receita do mês</span>
          </RouterLink>
          <RouterLink
            v-if="quickStats.lowStockCount > 0"
            :to="{ name: 'admin-inventory' }"
            class="admin__quickstat admin__quickstat--warning"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
            <strong data-count :data-value="quickStats.lowStockCount">{{ quickStats.lowStockCount }}</strong>
            <span class="admin__quickstat-short">em falta</span>
            <span class="admin__quickstat-label">{{ quickStats.lowStockCount === 1 ? 'item com estoque baixo' : 'itens com estoque baixo' }}</span>
          </RouterLink>
        </div>
      </Transition>
      </div>
    </header>

    <main ref="content" class="container admin__content">
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
/* Fundo com dois brilhos parados (rosé no alto, champagne embaixo) — dá
   profundidade ao creme sem nada animado nem desfoque. */
.admin {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background:
    radial-gradient(70% 45% at 100% 0%, rgba(220, 171, 168, 0.32) 0%, transparent 70%),
    radial-gradient(55% 40% at 0% 100%, rgba(200, 164, 101, 0.16) 0%, transparent 70%),
    var(--color-surface-muted);
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
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
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

.admin__brand-mark {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.admin__brand img {
  /* Tamanho grande mantido a pedido explícito do cliente (era 56px, depois
     72px, depois 92px) — só levemente reduzido para caber na linha única
     que agora também leva os chips de status. */
  height: 84px;
  width: auto;
  flex-shrink: 0;
  position: relative;
}

/* Faixa de luz dourada recortada pela própria logo (mask-image com o PNG):
   só os traços brilham. Parada fora do quadro (background-position) até o
   GSAP passar a faixa de um lado ao outro — ver shineLogo no script. */
.admin__brand-shine {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: linear-gradient(105deg, transparent 35%, rgba(255, 236, 196, 0.95) 48%, rgba(200, 164, 101, 0.9) 52%, transparent 65%);
  background-size: 220% 100%;
  background-repeat: no-repeat;
  background-position: -60% 0;
  -webkit-mask: url('/brand/logo-noely-cerqueira.png') center / contain no-repeat;
  mask: url('/brand/logo-noely-cerqueira.png') center / contain no-repeat;
  mix-blend-mode: screen;
}

.admin__brand-divider {
  width: 1px;
  height: 44px;
  margin-inline: var(--space-5);
  background: var(--color-border);
  flex-shrink: 0;
}

.admin__brand-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* Saudação na serifada (o nome em itálico) — o mesmo tom do site público,
   para o painel soar como parte da marca e não como um sistema genérico. */
.admin__brand-title {
  font-family: var(--font-serif);
  font-size: 1.55rem;
  font-weight: 350;
  font-variation-settings: 'SOFT' 80;
  letter-spacing: -0.015em;
  line-height: 1.15;
  color: var(--color-rose-900);
  white-space: nowrap;
}

.admin__brand-title em {
  font-style: italic;
  color: var(--color-rose-700);
}

.admin__brand-date {
  font-size: 0.82rem;
  color: var(--color-ink-muted);
  /* "segunda-feira, 2 de novembro" — a primeira letra em maiúscula. */
  text-transform: lowercase;
}

.admin__brand-date::first-letter {
  text-transform: none;
}

/* Abaixo de 640px não sobra largura para logo + divisor + saudação ao lado
   da conta e do botão Sair sem colidir — mantém só a logo. */
@media (max-width: 640px) {
  .admin__brand-divider,
  .admin__brand-text {
    display: none;
  }

  .admin__brand img {
    height: 56px;
  }
}

/* Linha das abas: abas à esquerda (rolam na horizontal se faltar espaço),
   chips de status à direita. */
.admin__navrow {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding-right: var(--space-5);
}

/* Tira de estatísticas ao vivo (ver quickStats no script) — só a partir
   de 1600px, onde sobra largura depois das nove abas; abaixo disso as abas
   precisam da linha inteira (com a aba WhatsApp, a 1440px os chips já
   cortavam a última aba). */
.admin__quickstats {
  display: none;
}

@media (min-width: 1600px) {
  .admin__quickstats {
    display: flex;
    flex-shrink: 0;
    gap: var(--space-2);
    padding-bottom: var(--space-3);
  }
}

/* Rótulo curto ("hoje", "no mês", "em falta") até 1600px, completo daí
   para cima: com o rótulo longo, os chips roubavam largura das abas e
   "Usuários"/"Auditoria" ficavam cortados a 1440px. */
.admin__quickstat-label {
  display: none;
}

@media (min-width: 1600px) {
  .admin__quickstat-short {
    display: none;
  }

  .admin__quickstat-label {
    display: inline;
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
  flex: 1;
  min-width: 0;
  display: flex;
  gap: var(--space-2);
  font-weight: 600;
  color: var(--color-ink-muted);
  padding: 0 var(--space-5) var(--space-3);
  /* Abas quebram linha quando não cabem, em vez de rolar de lado com a
     última cortada no meio da palavra (acontecia em tablet). */
  flex-wrap: wrap;
}

.admin__nav::-webkit-scrollbar {
  display: none;
}

/* Celular: as abas quebram em linhas em vez de rolar de lado — na rolagem,
   a última aba visível ficava cortada no meio da palavra. */
@media (max-width: 720px) {
  .admin__nav {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    overflow: visible;
    gap: 2px;
    font-size: 0.85rem;
  }

  .admin__nav > a {
    justify-content: center;
    gap: 5px;
    padding: 6px 4px;
  }

  .admin__nav > a :deep(svg),
  .admin__nav > a svg {
    flex-shrink: 0;
  }
}

/* Hover simples, sem animação seguindo o mouse (a clínica pediu para tirar). */
.admin__nav > a:not([aria-current]):hover {
  background: var(--color-surface-muted);
  border-radius: var(--radius-pill);
}

/* Aba ativa: tom rosé pálido com texto escuro — num painel, a cor forte
   fica para os dados; uma pílula na cor da marca em cada aba ativa é
   acento gasto na moldura. */
.admin__nav-indicator {
  position: absolute;
  top: 0;
  left: 0;
  background: var(--color-rose-100);
  border-radius: var(--radius-pill);
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
  color: var(--color-rose-900);
}

.admin__nav a.router-link-exact-active:hover {
  color: var(--color-rose-900);
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
  background: var(--color-fill-900);
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
  text-transform: none;
  letter-spacing: 0;
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

.admin__theme {
  padding: 8px 10px;
}

/* Sol e lua giram ao trocar. */
.theme-icon-enter-active,
.theme-icon-leave-active {
  transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.25s ease;
}

.theme-icon-enter-from {
  transform: rotate(-120deg) scale(0.4);
  opacity: 0;
}

.theme-icon-leave-to {
  transform: rotate(120deg) scale(0.4);
  opacity: 0;
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

/* Títulos dos grupos do menu: só existem na barra lateral. */
.admin__nav-group {
  display: none;
}

/* ── Computador: o topo vira uma barra lateral escura ─────────────────────
   Com 11 abas, a linha do topo quebrava em duas (Auditoria caía para baixo).
   A partir de 1180px o <header> inteiro vira uma coluna fixa à esquerda, em
   chocolate com toques champagne — o contraste que faltava ao painel todo
   em creme. Feito só com CSS: as linhas internas (topbar-row, navrow,
   account) viram `display: contents`, então logo, busca, abas, atalhos e a
   conta passam a ser itens da mesma coluna e são reordenados com `order`. */
@media (min-width: 1180px) {
  .admin {
    --sidebar-w: 276px;
    padding-left: var(--sidebar-w);
  }

  .admin__topbar {
    position: fixed;
    inset: 0 auto 0 0;
    width: var(--sidebar-w);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-5) var(--space-4) var(--space-4);
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-width: none;
    border-bottom: none;
    border-right: 1px solid rgba(255, 255, 255, 0.06);
    color: #fff;
    background:
      radial-gradient(140% 50% at 0% 0%, rgba(185, 124, 127, 0.28) 0%, transparent 60%),
      radial-gradient(120% 40% at 100% 100%, rgba(200, 164, 101, 0.16) 0%, transparent 60%),
      linear-gradient(180deg, var(--color-dusk-800) 0%, var(--color-dusk-900) 100%);
  }

  .admin__topbar::-webkit-scrollbar {
    display: none;
  }

  /* Textura fininha de ruído: dá "matéria" ao chocolate sem custo (imagem
     parada, nada animado). */
  .admin__topbar::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.07;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }

  .admin__topbar-row,
  .admin__navrow,
  .admin__account {
    display: contents;
  }

  .admin__brand {
    order: 1;
    position: relative;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
    padding: 0 var(--space-2) var(--space-3);
  }

  .admin__brand img {
    height: 70px;
    /* Logo em champagne claro sobre o chocolate (o PNG original é rosé
       escuro, que sumiria no fundo). */
    filter: brightness(0) invert(1) sepia(0.35) saturate(1.6) hue-rotate(-12deg) brightness(0.96);
  }

  .admin__brand-divider {
    display: none;
  }

  /* Botão de tema no alto da barra lateral (pedido da clínica: não lá
     embaixo, ao lado do Sair). Duas classes: vence o estilo do .admin__logout. */
  .admin__logout.admin__theme {
    /* fixed (não absolute): a barra lateral tem rolagem própria e o botão
       rolava junto, sumindo. Canto de cima da barra, sempre visível. */
    position: fixed;
    top: var(--space-4);
    left: calc(var(--sidebar-w) - 40px - var(--space-4));
    z-index: 2;
    width: 40px;
    height: 40px;
    padding: 0;
    justify-content: center;
    border-color: rgba(255, 255, 255, 0.16);
    color: rgba(255, 255, 255, 0.85);
    background: rgba(255, 255, 255, 0.06);
  }

  .admin__logout.admin__theme:hover {
    border-color: rgba(200, 164, 101, 0.6);
    background: rgba(255, 255, 255, 0.12);
  }

  .admin__brand-title {
    font-size: 1.5rem;
    color: #fff;
    white-space: normal;
  }

  .admin__brand-title em {
    color: var(--color-gold-500);
  }

  .admin__brand-date {
    color: rgba(255, 255, 255, 0.5);
  }

  .admin__topbar :deep(.admin-cmdk-trigger) {
    order: 2;
    width: 100%;
    justify-content: flex-start;
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.7);
  }

  .admin__topbar :deep(.admin-cmdk-trigger:hover) {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(200, 164, 101, 0.5);
    color: #fff;
  }

  .admin__topbar :deep(.admin-cmdk-trigger kbd) {
    margin-left: auto;
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.6);
  }

  .admin__nav {
    order: 3;
    flex: none;
    flex-direction: column;
    flex-wrap: nowrap;
    gap: 2px;
    padding: 0;
    color: rgba(255, 255, 255, 0.66);
  }

  .admin__nav-group {
    display: block;
    position: relative;
    z-index: 1;
    padding: var(--space-4) 14px 6px;
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(200, 164, 101, 0.7);
  }

  .admin__nav-group:first-child {
    padding-top: var(--space-2);
  }

  .admin__nav > a {
    width: 100%;
    min-height: 42px;
    padding: 9px 14px;
    gap: 12px;
    border-radius: 12px;
  }

  .admin__nav > a svg {
    width: 17px;
    height: 17px;
  }

  .admin__nav > a:hover {
    color: #fff;
    transform: translateX(3px);
  }

  .admin__nav a.router-link-exact-active,
  .admin__nav a.router-link-exact-active:hover {
    color: var(--color-dusk-900);
    font-weight: 700;
  }

  .admin__nav > a:not([aria-current]):hover {
    background: rgba(255, 255, 255, 0.07);
    border-radius: 12px;
  }

  /* Aba ativa: champagne com um brilho por baixo — a joia da coluna. */
  .admin__nav-indicator {
    border-radius: 12px;
    background: linear-gradient(135deg, #fbf3e3 0%, var(--color-gold-100) 55%, #e9d3a8 100%);
    box-shadow: 0 10px 28px -10px rgba(200, 164, 101, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.8);
  }

  .admin__quickstats {
    order: 4;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: var(--space-4) 0 0;
    margin-top: var(--space-2);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .admin__quickstat {
    justify-content: flex-start;
    border-radius: 12px;
    padding: 9px 12px;
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.6);
  }

  .admin__quickstat:hover {
    border-color: rgba(200, 164, 101, 0.45);
    background: rgba(255, 255, 255, 0.07);
    box-shadow: none;
  }

  .admin__quickstat svg {
    color: var(--color-gold-500);
  }

  .admin__quickstat strong {
    color: #fff;
  }

  .admin__quickstat-short {
    display: none;
  }

  .admin__quickstat-label {
    display: inline;
  }

  .admin__quickstat--warning {
    background: rgba(164, 69, 63, 0.16);
    border-color: rgba(220, 120, 110, 0.35);
  }

  .admin__quickstat--warning svg,
  .admin__quickstat--warning strong {
    color: #f0a49b;
  }

  .admin__user {
    order: 5;
    margin-top: auto;
    flex-direction: row-reverse;
    justify-content: flex-end;
    padding: var(--space-4) var(--space-2) 0;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .admin__user-text {
    align-items: flex-start;
    color: #fff;
  }

  .admin__role {
    align-self: flex-start;
  }

  .admin__avatar {
    background: linear-gradient(135deg, var(--color-gold-500), var(--color-rose-700));
  }

  .admin__avatar-status {
    border-color: var(--color-dusk-900);
  }

  .admin__logout {
    order: 6;
    justify-content: center;
    color: rgba(255, 255, 255, 0.78);
    border-color: rgba(255, 255, 255, 0.14);
  }

  .admin__logout:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(200, 164, 101, 0.5);
  }

  .admin__content {
    padding-top: var(--space-7);
  }
}
</style>
