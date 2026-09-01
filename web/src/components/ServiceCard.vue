<script setup lang="ts">
import type { Service } from '@/types';

defineProps<{ service: Service; selected?: boolean }>();
defineEmits<{ select: [] }>();

function formatPrice(price: number | null) {
  if (price == null) return 'Consulte';
  return price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
</script>

<template>
  <button type="button" class="service-card" :class="{ 'service-card--selected': selected }" @click="$emit('select')">
    <span class="service-card__thumb" aria-hidden="true">
      <img v-if="service.imageUrl" :src="service.imageUrl" :alt="service.name" />
      <span v-else class="service-card__thumb-fallback">{{ service.name.charAt(0) }}</span>
    </span>

    <span class="service-card__body">
      <span class="service-card__name">{{ service.name }}</span>
      <span v-if="service.description" class="service-card__description">{{ service.description }}</span>
      <span class="service-card__meta">
        <span class="service-card__duration">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          {{ service.durationMinutes }} min
        </span>
        <span class="service-card__price">{{ formatPrice(service.price) }}</span>
      </span>
    </span>

    <span class="service-card__indicator" :class="{ 'service-card__indicator--on': selected }" aria-hidden="true" />
  </button>
</template>

<style scoped>
.service-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  width: 100%;
  text-align: left;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  padding-left: calc(var(--space-3) + 3px);
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard);
}

.service-card::before {
  content: '';
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: 0;
  width: 3px;
  border-radius: var(--radius-pill);
  background: var(--color-rose-700);
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-standard);
}

.service-card:hover {
  border-color: var(--color-rose-300);
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}

.service-card--selected {
  border-color: var(--color-rose-700);
  box-shadow: var(--shadow-sm);
  background: var(--color-rose-100);
}

.service-card--selected::before {
  opacity: 1;
}

.service-card__thumb {
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: linear-gradient(135deg, var(--color-rose-100), var(--color-rose-300));
  display: flex;
  align-items: center;
  justify-content: center;
}

.service-card__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform var(--duration-base) var(--ease-premium);
}

.service-card:hover .service-card__thumb img {
  transform: scale(1.08);
}

.service-card__thumb-fallback {
  font-family: var(--font-display);
  font-size: 1.5rem;
  color: var(--color-rose-700);
}

.service-card__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.service-card__name {
  font-weight: 600;
  color: var(--color-ink);
}

.service-card__description {
  font-size: 0.85rem;
  color: var(--color-ink-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.service-card__meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: 2px;
}

.service-card__duration {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-ink-soft);
  background: var(--color-surface-muted);
  border-radius: var(--radius-pill);
  padding: 2px 8px;
}

.service-card__price {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--color-rose-700);
}

.service-card__indicator {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid var(--color-border);
}

.service-card__indicator--on {
  border-color: var(--color-rose-700);
  background: radial-gradient(circle, var(--color-rose-700) 45%, transparent 50%);
}
</style>
