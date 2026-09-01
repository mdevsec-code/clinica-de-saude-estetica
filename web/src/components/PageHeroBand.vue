<script setup lang="ts">
import { nextTick, onMounted } from 'vue';
import DecorativeDots from './DecorativeDots.vue';
import { useScrollReveal } from '@/composables/useScrollReveal';
import { applySplitHeadingReveal } from '@/composables/useSplitReveal';

withDefaults(defineProps<{ eyebrow?: string; title?: string; description?: string }>(), {
  eyebrow: undefined,
  title: undefined,
  description: undefined,
});

// Auto-contido de propósito: nenhuma das views que usam este componente
// (Serviços, Agendamento, Contato) chama useScrollReveal — sem isso aqui, o
// header inteiro ficava com opacity:0 para sempre (regra global em
// styles/global.css aplicada ao antigo atributo data-reveal do próprio
// header, que nunca era revelado por ninguém). `body` como container (não
// `.page-hero`, que É o item a revelar — querySelectorAll nunca inclui o
// próprio elemento chamador, só descendentes) e `.page-hero` como item.
useScrollReveal('body', '.page-hero');

onMounted(async () => {
  await nextTick();
  applySplitHeadingReveal('.page-hero__title');
});
</script>

<template>
  <header class="page-hero">
    <DecorativeDots :count="10" />
    <div class="container page-hero__inner">
      <p v-if="eyebrow" class="page-hero__eyebrow">{{ eyebrow }}</p>
      <h1 v-if="title" class="page-hero__title">{{ title }}</h1>
      <p v-if="description" class="page-hero__description">{{ description }}</p>
      <div v-if="$slots.default" class="page-hero__extra">
        <slot />
      </div>
    </div>
  </header>
</template>

<style scoped>
.page-hero {
  position: relative;
  overflow: hidden;
  padding-block: var(--space-8) var(--space-6);
  background-color: var(--color-bg);
  background-image: radial-gradient(circle at 15% 15%, var(--color-rose-100) 0%, transparent 55%),
    radial-gradient(circle at 92% 10%, var(--color-surface-muted) 0%, transparent 50%);
}

.page-hero__inner {
  position: relative;
}

.page-hero__eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--color-rose-700);
  margin-bottom: var(--space-2);
}

.page-hero__title {
  font-size: clamp(2.4rem, 6vw, 3.4rem);
  /* 1.28, não a base de 1.1 do h1: SplitText mask:'lines' (applySplitHeadingReveal
     acima) corta o topo de maiúsculas/acentos numa serifada tão alta quanto a
     Cormorant Garamond se a caixa da linha for calculada com line-height
     apertado — ver o mesmo ajuste/motivo em [data-split] no global.css. */
  line-height: 1.28;
  margin-bottom: var(--space-3);
  overflow-wrap: break-word;
}

.page-hero__description {
  color: var(--color-ink-muted);
  font-size: 1.15rem;
  max-width: 56ch;
}

.page-hero__extra {
  margin-top: var(--space-5);
}
</style>
