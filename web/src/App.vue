<script setup lang="ts">
import { computed, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppHeader from '@/components/AppHeader.vue';
import AppFooter from '@/components/AppFooter.vue';
import WhatsAppButton from '@/components/WhatsAppButton.vue';
import AmbientBackground from '@/components/AmbientBackground.vue';
import GrainOverlay from '@/components/GrainOverlay.vue';
import ScrollProgress from '@/components/ScrollProgress.vue';
import { refreshScroll, resetScrollTop } from '@/composables/useSmoothScroll';

const router = useRouter();
const route = useRoute();

// O painel administrativo (AdminLayout) tem sua própria barra superior,
// navegação e rodapé implícito — sem esta checagem, o header/footer do site
// público (com o menu Início/Serviços/Contato/Agendar e o rodapé completo de
// contato) ficava renderizado por cima E embaixo do painel em TODA rota
// /admin/*, duplicando marca e navegação numa ferramenta de trabalho interna.
const isAdminRoute = computed(() => route.path.startsWith('/admin'));

// Cada troca de rota muda a altura da página (e o Vue troca a view inteira
// dentro da transição abaixo) — sem resetar o topo e recalcular os limites
// de scroll, o ScrollSmoother/ScrollTrigger ficariam com posições da página
// anterior por um instante.
router.afterEach(async () => {
  await nextTick();
  resetScrollTop();
  refreshScroll();
});
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
  <Teleport to="#ambient-slot">
    <AmbientBackground />
  </Teleport>

  <AppHeader v-if="!isAdminRoute" />
  <main>
    <RouterView v-slot="{ Component, route: viewRoute }">
      <Transition name="page" mode="out-in">
        <component :is="Component" :key="viewRoute.path" />
      </Transition>
    </RouterView>
  </main>
  <AppFooter v-if="!isAdminRoute" />

  <Teleport to="#overlay-slot">
    <ScrollProgress v-if="!isAdminRoute" />
    <WhatsAppButton v-if="!isAdminRoute" variant="floating" />
    <GrainOverlay />
  </Teleport>
</template>

<style>
.page-enter-active,
.page-leave-active {
  transition: opacity 0.45s var(--ease-premium), transform 0.45s var(--ease-premium);
}

.page-enter-from {
  opacity: 0;
  transform: translateY(18px) scale(0.994);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.998);
}
</style>
