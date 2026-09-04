<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { fetchCategories } from '@/services/catalog.service';
import { useBookingStore } from '@/stores/booking';
import { applyStaggerReveal } from '@/composables/useStaggerReveal';
import { refreshScroll, scrollToElement } from '@/composables/useSmoothScroll';
import type { Service, ServiceCategory } from '@/types';
import CategoryAccordion from '@/components/CategoryAccordion.vue';
import LoadingState from '@/components/LoadingState.vue';
import EmptyState from '@/components/EmptyState.vue';
import BookingSummaryBar from '@/components/BookingSummaryBar.vue';
import PageHeroBand from '@/components/PageHeroBand.vue';

const categories = ref<ServiceCategory[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const booking = useBookingStore();
const router = useRouter();

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const { categories: data } = await fetchCategories();
    categories.value = data;
  } catch {
    error.value = 'Não foi possível carregar os serviços agora. Tente novamente em instantes.';
  } finally {
    loading.value = false;
  }
  await nextTick();
  applyStaggerReveal('.services-page__list', '.accordion');
  refreshScroll();
}

onMounted(load);

function handleSelect(service: Service) {
  booking.selectService(service);
}

function goToBooking() {
  router.push('/agendar');
}

function jumpToCategory(category: ServiceCategory) {
  scrollToElement(`#category-${category.id}`);
}

const totalServices = computed(() => categories.value.reduce((sum, c) => sum + c.services.length, 0));
</script>

<template>
  <div class="services-page">
    <PageHeroBand
      eyebrow="Catálogo"
      title="Nossos serviços"
      description="Escolha o procedimento e siga direto para o agendamento."
    />

    <div class="container services-page__body">
      <LoadingState v-if="loading" label="Carregando serviços…" />
      <EmptyState
        v-else-if="error"
        title="Algo deu errado"
        :description="error"
        action-label="Tentar novamente"
        @action="load"
      />
      <EmptyState v-else-if="!categories.length" title="Nenhum serviço publicado ainda." />
      <template v-else>
        <div class="services-page__intro">
          <p class="services-page__count">
            {{ categories.length }} {{ categories.length === 1 ? 'categoria' : 'categorias' }} ·
            {{ totalServices }} {{ totalServices === 1 ? 'serviço disponível' : 'serviços disponíveis' }}
          </p>
          <nav v-if="categories.length > 1" class="services-page__chips" aria-label="Ir para categoria">
            <button
              v-for="category in categories"
              :key="category.id"
              type="button"
              class="services-page__chip"
              @click="jumpToCategory(category)"
            >
              {{ category.name }}
            </button>
          </nav>
        </div>
        <div class="services-page__list">
          <CategoryAccordion
            v-for="category in categories"
            :key="category.id"
            :category="category"
            :selected-service-id="booking.selectedService?.id"
            :default-open="categories[0]?.id === category.id"
            @select-service="handleSelect"
          />
        </div>
      </template>
    </div>

    <BookingSummaryBar ctaLabel="Continuar" @continue="goToBooking" />
  </div>
</template>

<style scoped>
.services-page__body {
  padding-top: var(--space-6);
}

.services-page__intro {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-5);
}

.services-page__count {
  font-size: 0.9rem;
  color: var(--color-ink-muted);
  white-space: nowrap;
}

.services-page__chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  /* padding-right + scroll-snap: sem isso, rolar a lista podia "sobrar" com
     um chip só parcialmente visível — a borda arredondada dele cortada bem
     na borda do container, lendo como bug visual em vez de rolagem normal.
     "mandatory" (não "proximity") é o que garante isso de verdade: proximity
     só encaixa se o gesto já tiver parado PERTO de um chip inteiro — um
     arrasto curto que solta no meio de um chip fica parado ali mesmo, exatamente
     o corte relatado. Mandatory sempre completa o encaixe pro chip mais
     próximo, não importa onde o gesto termine. scroll-snap-align (em
     .services-page__chip) marca onde cada chip encaixa; o padding dá folga
     física pro último não colar na borda mesmo no fim do scroll. */
  padding-bottom: 2px;
  padding-right: var(--space-5);
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
}

.services-page__chips::-webkit-scrollbar {
  display: none;
}

.services-page__chip {
  flex-shrink: 0;
  scroll-snap-align: start;
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-rose-700);
  background: var(--color-rose-100);
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  padding: 7px 16px;
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard);
}

.services-page__chip:hover {
  border-color: var(--color-rose-500);
  transform: translateY(-1px);
}

.services-page__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding-bottom: var(--space-8);
}
</style>
