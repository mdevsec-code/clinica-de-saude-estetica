<script setup lang="ts">
withDefaults(
  defineProps<{ title: string; description?: string; actionLabel?: string }>(),
  { description: undefined, actionLabel: undefined },
);

defineEmits<{ action: [] }>();
</script>

<template>
  <div class="empty-state">
    <p class="empty-state__title">{{ title }}</p>
    <p v-if="description" class="empty-state__description">{{ description }}</p>
    <button v-if="actionLabel" type="button" class="empty-state__action" @click="$emit('action')">
      {{ actionLabel }}
    </button>
  </div>
</template>

<style scoped>
.empty-state {
  text-align: center;
  padding: var(--space-7) var(--space-4);
  color: var(--color-ink-muted);
}

.empty-state__title {
  font-weight: 600;
  color: var(--color-ink);
  margin-bottom: var(--space-2);
}

.empty-state__action {
  margin-top: var(--space-4);
  background: none;
  border: 1px solid var(--color-rose-500);
  color: var(--color-rose-700);
  padding: 10px 20px;
  border-radius: var(--radius-pill);
  font-weight: 600;
  cursor: pointer;
}
</style>
