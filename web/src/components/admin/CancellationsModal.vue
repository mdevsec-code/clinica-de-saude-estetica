<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiRequest } from '@/services/api';
import AdminModal from './AdminModal.vue';

// Histórico de cancelamentos: os 100 mais recentes, com quem desmarcou.
interface Cancellation {
  id: string;
  startAt: string;
  cancelledAt: string | null;
  cancelledByName: string | null;
  source: 'PUBLIC_SITE' | 'INTERNAL';
  createdByName: string | null;
  customer: { name: string; whatsapp: string };
  service: { name: string };
}

const emit = defineEmits<{ close: [] }>();
const items = ref<Cancellation[] | null>(null);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    items.value = (await apiRequest<{ cancellations: Cancellation[] }>('/appointments/cancellations')).cancellations;
  } catch {
    error.value = 'Não foi possível carregar os cancelamentos.';
  }
});

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
</script>

<template>
  <AdminModal title="Cancelamentos" wide @close="emit('close')">
    <p v-if="error" class="admin-error">{{ error }}</p>
    <p v-else-if="!items" class="cancel__muted">Carregando…</p>
    <p v-else-if="!items.length" class="cancel__muted">Nenhum atendimento cancelado.</p>
    <ul v-else class="cancel">
      <li v-for="c in items" :key="c.id" class="cancel__row">
        <div>
          <p class="cancel__name">{{ c.customer.name }} · {{ c.service.name }}</p>
          <p class="cancel__meta">
            Era {{ fmt(c.startAt) }} · marcado {{ c.source === 'PUBLIC_SITE' ? 'pela cliente no site' : `por ${c.createdByName ?? 'alguém da equipe'}` }}
          </p>
        </div>
        <p class="cancel__when">
          Desmarcado {{ c.cancelledAt ? `em ${fmt(c.cancelledAt)}` : '' }}
          <template v-if="c.cancelledByName"><br />por {{ c.cancelledByName }}</template>
        </p>
      </li>
    </ul>
  </AdminModal>
</template>

<style scoped>
.cancel {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.cancel__row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-2) var(--space-4);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  background: var(--color-surface-muted);
}

.cancel__name {
  margin: 0;
  font-weight: 700;
}

.cancel__meta,
.cancel__when,
.cancel__muted {
  margin: 2px 0 0;
  font-size: 0.82rem;
  color: var(--color-ink-muted);
}

.cancel__when {
  color: var(--color-danger-ink);
}
</style>
