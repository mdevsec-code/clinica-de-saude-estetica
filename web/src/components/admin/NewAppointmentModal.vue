<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import AdminModal from './AdminModal.vue';
import AdminDatePicker from './AdminDatePicker.vue';
import AdminSelect, { type AdminSelectGroup } from './AdminSelect.vue';
import { fetchCategories } from '@/services/catalog.service';
import { fetchAvailableSlots } from '@/services/availability.service';
import { createAppointment } from '@/services/appointments.service';
import { ApiError } from '@/services/api';
import { toLocalDateKey } from '@/utils/calendar';
import type { Service, ServiceCategory, Slot } from '@/types';

const emit = defineEmits<{ close: []; created: [] }>();

const categories = ref<ServiceCategory[]>([]);
const loadingCategories = ref(true);

onMounted(async () => {
  try {
    const { categories: data } = await fetchCategories();
    categories.value = data;
  } finally {
    loadingCategories.value = false;
  }
});

// Sem isso, uma clínica que ainda não cadastrou nenhum serviço via
// /admin/servicos via um <select> tecnicamente presente mas com zero
// opções reais — parece "quebrado" (nada acontece ao clicar) em vez de
// deixar claro que o passo que falta é cadastrar um serviço primeiro.
const hasAnyService = computed(() => categories.value.some((c) => c.services.length > 0));

const serviceOptions = computed<AdminSelectGroup[]>(() =>
  categories.value
    .filter((c) => c.services.length > 0)
    .map((category) => ({
      label: category.name,
      options: category.services.map((service) => ({
        value: service.id,
        label: `${service.name} (${service.durationMinutes} min)`,
      })),
    })),
);

const selectedServiceId = ref('');
const selectedService = computed<Service | null>(() => {
  for (const category of categories.value) {
    const match = category.services.find((s) => s.id === selectedServiceId.value);
    if (match) return match;
  }
  return null;
});

const todayKey = toLocalDateKey(new Date());
const date = ref(todayKey);
const slots = ref<Slot[]>([]);
const loadingSlots = ref(false);
const selectedSlot = ref<Slot | null>(null);

async function loadSlots() {
  if (!selectedServiceId.value || !date.value) {
    slots.value = [];
    return;
  }
  loadingSlots.value = true;
  selectedSlot.value = null;
  try {
    const { slots: result } = await fetchAvailableSlots(selectedServiceId.value, date.value);
    slots.value = result;
  } catch {
    slots.value = [];
  } finally {
    loadingSlots.value = false;
  }
}

watch([selectedServiceId, date], loadSlots);

function formatSlotTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bahia' });
}

const customer = reactive({ name: '', whatsapp: '', email: '' });
const notes = ref('');
const submitting = ref(false);
const submitError = ref<string | null>(null);

async function onSubmit() {
  if (!selectedSlot.value) return;
  submitting.value = true;
  submitError.value = null;
  try {
    await createAppointment({
      serviceId: selectedServiceId.value,
      startAt: selectedSlot.value.startAt,
      customer: {
        name: customer.name.trim(),
        whatsapp: customer.whatsapp.trim(),
        email: customer.email.trim() || undefined,
      },
      notes: notes.value.trim() || undefined,
    });
    emit('created');
  } catch (err) {
    submitError.value = err instanceof ApiError ? err.message : 'Não foi possível criar o agendamento.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <AdminModal title="Novo agendamento" @close="emit('close')">
    <div v-if="!loadingCategories && !hasAnyService" class="new-appt__empty">
      <p>Nenhum serviço cadastrado ainda — cadastre ao menos um serviço para poder agendar um atendimento.</p>
      <RouterLink to="/admin/servicos" class="button button--primary" @click="emit('close')">Ir para Serviços</RouterLink>
    </div>

    <form v-else class="new-appt" @submit.prevent="onSubmit">
      <label class="admin-field">
        Serviço
        <AdminSelect v-model="selectedServiceId" :options="serviceOptions" placeholder="Selecione um serviço" :disabled="loadingCategories" />
      </label>

      <label class="admin-field">
        Data
        <AdminDatePicker v-model="date" :min="todayKey" />
      </label>

      <div v-if="selectedServiceId" class="new-appt__slots">
        <p v-if="loadingSlots" class="new-appt__hint">Carregando horários…</p>
        <p v-else-if="!slots.length" class="new-appt__hint">Nenhum horário disponível nesta data.</p>
        <div v-else class="new-appt__slot-grid">
          <button
            v-for="slot in slots"
            :key="slot.startAt"
            type="button"
            class="new-appt__slot"
            :class="{ 'new-appt__slot--selected': selectedSlot?.startAt === slot.startAt }"
            @click="selectedSlot = slot"
          >
            {{ formatSlotTime(slot.startAt) }}
          </button>
        </div>
      </div>

      <template v-if="selectedSlot">
        <label class="admin-field">
          Nome da cliente
          <input v-model="customer.name" type="text" required />
        </label>
        <label class="admin-field">
          WhatsApp (com DDD)
          <input v-model="customer.whatsapp" type="tel" inputmode="numeric" placeholder="71999999999" required />
        </label>
        <label class="admin-field">
          E-mail (opcional)
          <input v-model="customer.email" type="email" />
        </label>
        <label class="admin-field">
          Observações (opcional)
          <input v-model="notes" type="text" />
        </label>

        <p v-if="submitError" class="admin-error">{{ submitError }}</p>
        <button type="submit" class="button button--primary" :disabled="submitting">
          {{ submitting ? 'Agendando…' : 'Confirmar agendamento' }}
        </button>
      </template>
    </form>
  </AdminModal>
</template>

<style scoped>
.new-appt {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.new-appt__empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-4);
  text-align: left;
}

.new-appt__empty p {
  color: var(--color-ink-muted);
}

/* Tipografia, borda, fundo, foco e a setinha do select são compartilhados —
   ver .admin-field em styles/global.css. Este formulário não precisa de
   nenhum dimensionamento próprio (nada de flex/min-width específico), por
   isso não sobra nenhuma regra local aqui. */

.new-appt__hint {
  font-size: 0.85rem;
  color: var(--color-ink-muted);
}

.new-appt__slot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
  gap: var(--space-2);
}

.new-appt__slot {
  padding: 10px 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  font-weight: 600;
  cursor: pointer;
}

.new-appt__slot--selected {
  border-color: var(--color-rose-700);
  background: var(--color-rose-700);
  color: #fff;
}

.admin-error {
  color: var(--color-danger);
  font-size: 0.85rem;
}
</style>
