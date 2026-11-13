<script setup lang="ts">
import { nextTick, onMounted, onUnmounted } from 'vue';
import { useScrollReveal } from '@/composables/useScrollReveal';
import { applySplitHeadingReveal } from '@/composables/useSplitReveal';

// `image`: foto real à direita do título no desktop (abaixo, no celular) —
// fecha a metade da primeira tela que ficaria vazia ao lado do texto.
withDefaults(defineProps<{ eyebrow?: string; title?: string; description?: string; image?: string; imageAlt?: string }>(), {
  eyebrow: undefined,
  title: undefined,
  description: undefined,
  image: undefined,
  imageAlt: '',
});

// Auto-contido de propósito: nenhuma das views que usam este componente
// (Serviços, Agendamento, Contato) chama useScrollReveal — sem isso aqui, o
// header inteiro ficava com opacity:0 para sempre (regra global em
// styles/global.css aplicada ao antigo atributo data-reveal do próprio
// header, que nunca era revelado por ninguém). `body` como container (não
// `.page-hero`, que É o item a revelar — querySelectorAll nunca inclui o
// próprio elemento chamador, só descendentes) e `.page-hero` como item.
useScrollReveal('body', '.page-hero');

let revertSplit: () => void = () => {};

onMounted(async () => {
  await nextTick();
  revertSplit = applySplitHeadingReveal('.page-hero__title');
});

onUnmounted(() => revertSplit());
</script>

<template>
  <header class="page-hero">
    <div class="container page-hero__inner" :class="{ 'page-hero__inner--image': image }">
      <div class="page-hero__text">
        <h1 v-if="title" class="page-hero__title">{{ title }}</h1>
        <p v-if="description" class="page-hero__description">{{ description }}</p>
        <div v-if="$slots.default" class="page-hero__extra">
          <slot />
        </div>
      </div>
      <figure v-if="image" class="page-hero__figure">
        <img :src="image" :alt="imageAlt" />
      </figure>
    </div>
  </header>
</template>

<style scoped>
/* Campo rosé claro chapado com o título grande — sem rótulo acima dele
   (a prop `eyebrow` ainda é aceita, mas não é mais exibida: a informação
   vai no próprio título e na descrição) e sem degradê de fundo. */
.page-hero {
  position: relative;
  overflow: hidden;
  padding-block: var(--space-8) var(--space-7);
  background: var(--color-rose-100);
}

.page-hero__inner {
  position: relative;
}

.page-hero__title {
  font-size: clamp(2.8rem, 6vw + 0.6rem, 5.4rem);
  font-weight: 350;
  letter-spacing: -0.03em;
  /* Não a base de 1.1 do h1: SplitText mask:'lines' corta o topo de
     maiúsculas acentuadas se a caixa da linha for apertada demais. */
  line-height: 1.08;
  margin-bottom: var(--space-4);
  overflow-wrap: break-word;
}

.page-hero__description {
  color: var(--color-ink);
  font-size: 1.35rem;
  line-height: 1.5;
  max-width: 44ch;
}

.page-hero__extra {
  margin-top: var(--space-6);
}

/* Só no desktop: no celular a foto empurraria o conteúdo da página (o
   formulário de agendamento, a lista de serviços) para longe da primeira
   tela, e ali o espaço vale mais do que a imagem. */
.page-hero__figure {
  display: none;
  margin: 0;
  overflow: hidden;
  background: var(--color-rose-300);
}

.page-hero__figure img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

@media (min-width: 900px) {
  .page-hero__inner--image {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
    align-items: center;
    gap: var(--space-8);
  }

  .page-hero__figure {
    display: block;
    aspect-ratio: 4 / 3;
  }
}
</style>
