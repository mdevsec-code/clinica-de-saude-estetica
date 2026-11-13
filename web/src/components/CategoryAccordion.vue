<script setup lang="ts">
import { assetUrl } from '@/utils/images';
import { ref } from 'vue';
import { gsap, prefersReducedMotion } from '@/lib/motion';
import type { Service, ServiceCategory } from '@/types';
import ServiceCard from './ServiceCard.vue';
import { refreshScroll } from '@/composables/useSmoothScroll';

const props = defineProps<{ category: ServiceCategory; selectedIds?: string[]; defaultOpen?: boolean }>();
const emit = defineEmits<{ selectService: [service: Service] }>();

const isOpen = ref(Boolean(props.defaultOpen));
const panel = ref<HTMLElement | null>(null);

function toggle() {
  isOpen.value = !isOpen.value;
}

// Respeita prefers-reduced-motion automaticamente: GSAP não anima altura fixa,
// apenas anima entre "auto" medido via getBoundingClientRect, e o usuário com
// a preferência ativada já tem as transições CSS zeradas globalmente; aqui
// reduzimos a duração também no JS quando aplicável.
// Abrir/fechar muda a altura da página: sem recalcular, os pontos de
// disparo do reveal das categorias de baixo ficam onde estavam com o painel
// aberto e, ao fechar, elas nunca aparecem (ficam em opacity 0).
function settle(done: () => void) {
  done();
  refreshScroll();
}

function onEnter(el: Element, done: () => void) {
  const element = el as HTMLElement;
  const reduced = prefersReducedMotion();
  const height = element.scrollHeight;
  gsap.fromTo(
    element,
    { height: 0, opacity: 0 },
    { height, opacity: 1, duration: reduced ? 0.01 : 0.45, ease: 'premium-out', onComplete: () => settle(done) },
  );
}

function onLeave(el: Element, done: () => void) {
  const element = el as HTMLElement;
  const reduced = prefersReducedMotion();
  gsap.to(element, { height: 0, opacity: 0, duration: reduced ? 0.01 : 0.32, ease: 'premium-in-out', onComplete: () => settle(done) });
}
</script>

<template>
  <div :id="`category-${category.id}`" class="accordion" :class="{ 'accordion--open': isOpen }">
    <button
      type="button"
      class="accordion__header"
      :aria-expanded="isOpen"
      :aria-controls="`category-panel-${category.id}`"
      @click="toggle"
    >
      <span class="accordion__thumb" aria-hidden="true">
        <img v-if="category.imageUrl" :src="assetUrl(category.imageUrl)" :alt="category.name" loading="lazy" decoding="async" />
        <span v-else class="accordion__thumb-fallback">{{ category.name.charAt(0) }}</span>
      </span>
      <span class="accordion__title">
        <span class="accordion__name">{{ category.name }}</span>
        <span class="accordion__count">{{ category.services.length }} {{ category.services.length === 1 ? 'serviço' : 'serviços' }}</span>
      </span>
      <span class="accordion__chevron" :class="{ 'accordion__chevron--open': isOpen }" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </span>
    </button>

    <Transition @enter="onEnter" @leave="onLeave">
      <div v-if="isOpen" :id="`category-panel-${category.id}`" ref="panel" class="accordion__panel">
        <ul class="accordion__list">
          <li v-for="service in category.services" :key="service.id">
            <ServiceCard
              :service="service"
              :selected="!!selectedIds?.includes(service.id)"
              @select="emit('selectService', service)"
            />
          </li>
        </ul>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.accordion {
  position: relative;
  scroll-margin-top: 96px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  overflow: hidden;
  transition: border-color var(--duration-base) var(--ease-premium), box-shadow var(--duration-base) var(--ease-premium);
}

.accordion--open {
}

.accordion__header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4);
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: background var(--duration-fast) var(--ease-standard);
}

.accordion__header:hover {
  background: var(--color-surface-muted);
}

.accordion__thumb {
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  border-radius: var(--radius-sm);
  background: var(--color-rose-100);
  color: var(--color-rose-900);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.accordion__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform var(--duration-base) var(--ease-premium);
}

.accordion__header:hover .accordion__thumb img {
  transform: scale(1.06);
}

.accordion__thumb-fallback {
  font-family: var(--font-display);
  font-size: 1.4rem;
  font-weight: 600;
}

.accordion__title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.accordion__name {
  font-family: var(--font-display);
  font-family: var(--font-serif);
  font-weight: 400;
  font-size: 1.65rem;
  letter-spacing: -0.01em;
  font-weight: 600;
  color: var(--color-ink);
}

.accordion__count {
  font-size: 1.05rem;
  color: var(--color-ink-muted);
}

.accordion__chevron {
  flex-shrink: 0;
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--color-rose-100);
  color: var(--color-rose-700);
  transition: transform var(--duration-base) var(--ease-premium), background var(--duration-base) var(--ease-premium);
}

.accordion__chevron--open {
  transform: rotate(180deg);
  background: var(--color-rose-700);
  color: #fff;
}

.accordion__panel {
  overflow: hidden;
}

.accordion__list {
  list-style: none;
  margin: 0;
  padding: 0 var(--space-4) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
</style>
