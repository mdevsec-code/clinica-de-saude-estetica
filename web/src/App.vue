<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { gsap, prefersReducedMotion } from '@/lib/motion';
import { useRoute, useRouter } from 'vue-router';
import AppHeader from '@/components/AppHeader.vue';
import AppFooter from '@/components/AppFooter.vue';
import WhatsAppButton from '@/components/WhatsAppButton.vue';
import ScrollProgress from '@/components/ScrollProgress.vue';
import AppIntroLoader from '@/components/AppIntroLoader.vue';
import { refreshScroll, resetScrollTop } from '@/composables/useSmoothScroll';

const router = useRouter();
const route = useRoute();

// O painel administrativo (AdminLayout) tem sua própria barra superior,
// navegação e rodapé implícito — sem esta checagem, o header/footer do site
// público (com o menu Início/Serviços/Contato/Agendar e o rodapé completo de
// contato) ficava renderizado por cima E embaixo do painel em TODA rota
// /admin/*, duplicando marca e navegação numa ferramenta de trabalho interna.
const isAdminRoute = computed(() => route.path.startsWith('/admin'));

// Ao abrir/recarregar o site, o código de cada página chega separado (lazy
// import no router). Sem esperar, cabeçalho e rodapé apareciam sozinhos por
// meio segundo — o rodapé colado no topo, porque a página ainda não existia
// — e só depois a página carregava. isReady() resolve quando a primeira
// rota (com o código da página) está pronta: tudo aparece de uma vez.
const ready = ref(false);
router.isReady().finally(() => (ready.value = true));

// Key da transição de PÁGINA (abaixo): usa o path da rota-mãe casada
// (route.matched[0].path), não o path resolvido completo. Por que isso
// importa — era a causa real (e nunca resolvida até aqui) da "tela fica
// branca ao trocar de aba do painel": /admin, /admin/financeiro,
// /admin/agenda... todas essas rotas casam a MESMA rota-mãe (/admin, ver
// router/index.ts), mas antes a key usava o path COMPLETO — diferente pra
// cada aba — então o Vue via cada troca de aba como uma troca de PÁGINA
// inteira, desmontando e remontando o AdminLayout INTEIRO (cabeçalho, nav,
// tudo) a cada clique, disparando a transição de página abaixo (mode="out-
// in", fade a partir de opacity:0) por cima de tudo — o mesmo padrão de bug
// já corrigido dentro do próprio AdminLayout.vue, só que uma camada acima,
// onde a correção interna nunca alcançava. Com a rota-mãe como key, as abas
// do painel mantêm UMA SÓ instância de AdminLayout (que já tem sua própria
// transição interna pra trocar de aba, ver AdminLayout.vue) — só troca de
// key (e por isso remonta com a transição de página) ao navegar pra uma
// página de nível diferente de verdade (Home, Serviços, Agendar, Login).
const pageKey = computed(() => route.matched[0]?.path ?? route.path);

// Cada troca de rota muda a altura da página — sem resetar o topo e
// recalcular os limites de scroll, o ScrollSmoother/ScrollTrigger ficariam
// com posições da página anterior. Quando a troca é de PÁGINA (a key muda e
// a transição com véu abaixo roda), quem reseta é o onEnter, no instante em
// que o véu está cobrindo a tela: resetar aqui, no afterEach, fazia a página
// antiga pular para o topo à vista de todos antes de sumir. Aqui fica só o
// caso sem transição de página — as abas do painel, que trocam dentro do
// mesmo AdminLayout.
router.afterEach(async (to, from) => {
  if (to.matched[0]?.path !== from.matched[0]?.path) return;
  await nextTick();
  resetScrollTop();
  refreshScroll();
});

// Véu de transição: um painel rosé sobe cobrindo a página que sai e depois
// se recolhe para cima, revelando a que entra — com a borda curva, a mesma
// forma da saída da cortina de abertura (AppIntroLoader.vue). É um único
// elemento fixo, teleportado para #overlay-slot (fora do conteúdo
// suavizado). Com prefers-reduced-motion, vira uma troca direta, sem véu
// nem deslocamento.
const veil = ref<HTMLElement | null>(null);

function onLeave(el: Element, done: () => void) {
  if (prefersReducedMotion() || !veil.value) {
    done();
    return;
  }
  gsap
    .timeline({ onComplete: done })
    .set(veil.value, { visibility: 'visible' })
    .fromTo(
      veil.value,
      { clipPath: 'ellipse(160% 0% at 50% 100%)' },
      { clipPath: 'ellipse(160% 140% at 50% 100%)', duration: 0.55, ease: 'premium-in-out' },
      0,
    )
    .to(el, { y: -40, opacity: 0.6, duration: 0.55, ease: 'premium-in-out' }, 0);
}

async function onEnter(el: Element, done: () => void) {
  await nextTick();
  resetScrollTop();
  refreshScroll();

  if (prefersReducedMotion() || !veil.value) {
    done();
    return;
  }
  gsap
    .timeline({ onComplete: done })
    .fromTo(
      veil.value,
      { clipPath: 'ellipse(160% 140% at 50% 0%)' },
      { clipPath: 'ellipse(160% 0% at 50% 0%)', duration: 0.75, ease: 'premium-out' },
      0,
    )
    .fromTo(el, { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: 'premium-out', clearProps: 'transform,opacity' }, 0.05)
    .set(veil.value, { visibility: 'hidden' });
}
</script>

<template>
  <!-- #app (onde este componente é montado) já vive dentro de
       #smooth-wrapper > #smooth-content (ver index.html + main.ts) — então
       tudo abaixo que NÃO for teleportado rola de forma suavizada junto com
       o conteúdo. Os elementos fixos de decoração são teleportados para fora
       dessa árvore (#ambient-slot/#overlay-slot, também em index.html):
       eles não precisam acompanhar o scroll suavizado, e --- no caso do
       fundo ambiente --- precisam continuar pintando ATRÁS de tudo, o que só
       dá pra garantir ficando fora do wrapper. -->
  <template v-if="ready">
  <AppHeader v-if="!isAdminRoute" />
  <main>
    <RouterView v-slot="{ Component }">
      <Transition mode="out-in" :css="false" @leave="onLeave" @enter="onEnter">
        <component :is="Component" :key="pageKey" />
      </Transition>
    </RouterView>
  </main>
  <AppFooter v-if="!isAdminRoute" />
  </template>

  <Teleport to="#overlay-slot">
    <ScrollProgress v-if="ready && !isAdminRoute" />
    <WhatsAppButton v-if="ready && !isAdminRoute" variant="floating" />
    <AppIntroLoader v-if="ready && !isAdminRoute" />
    <div ref="veil" class="route-veil" aria-hidden="true" />
  </Teleport>
</template>

<style>
.route-veil {
  position: fixed;
  inset: 0;
  /* Acima do header (40) e do WhatsApp (50), abaixo do grão (100). */
  z-index: 90;
  visibility: hidden;
  clip-path: ellipse(160% 0% at 50% 100%);
  pointer-events: none;
  background: radial-gradient(ellipse at 50% 120%, rgba(200, 164, 101, 0.28), transparent 60%),
    linear-gradient(180deg, var(--color-rose-700), var(--color-rose-900) 60%, var(--color-dusk-800));
}
</style>
