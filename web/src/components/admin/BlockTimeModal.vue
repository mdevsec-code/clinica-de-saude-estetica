<script setup lang="ts">
import { computed, ref } from 'vue';
import AdminModal from './AdminModal.vue';
import AdminDatePicker from './AdminDatePicker.vue';
import { createBlockedTime } from '@/services/admin-appointments.service';
import { ApiError } from '@/services/api';
import { toLocalDateKey } from '@/utils/calendar';

// initialStart/initialEnd: vêm do atalho da linha do tempo (horário vazio).
const props = defineProps<{ initialDate?: string; initialStart?: string; initialEnd?: string }>();
const emit = defineEmits<{ close: []; created: [] }>();

const TZ_OFFSET = '-03:00'; // America/Bahia, sem horário de verão.

const todayKey = toLocalDateKey(new Date());
const startDate = ref(props.initialDate && props.initialDate >= todayKey ? props.initialDate : todayKey);
const endDate = ref(startDate.value);
const allDay = ref(false);
const startTime = ref(props.initialStart ?? '12:00');
const endTime = ref(props.initialEnd ?? '13:00');
const reason = ref('');
const submitting = ref(false);
const submitError = ref<string | null>(null);

// Dia inteiro: da meia-noite do primeiro dia à meia-noite depois do último
// (cobre férias e folgas de vários dias de uma vez).
function nextDay(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return toLocalDateKey(new Date(y, m - 1, d + 1));
}

const range = computed(() =>
  allDay.value
    ? { startAt: `${startDate.value}T00:00:00${TZ_OFFSET}`, endAt: `${nextDay(endDate.value < startDate.value ? startDate.value : endDate.value)}T00:00:00${TZ_OFFSET}` }
    : { startAt: `${startDate.value}T${startTime.value}:00${TZ_OFFSET}`, endAt: `${startDate.value}T${endTime.value}:00${TZ_OFFSET}` },
);

const invalid = computed(() => !allDay.value && (!startTime.value || !endTime.value || endTime.value <= startTime.value));

async function onSubmit() {
  if (invalid.value) return;
  submitting.value = true;
  submitError.value = null;
  try {
    await createBlockedTime({ ...range.value, reason: reason.value.trim() || undefined });
    emit('created');
  } catch (err) {
    submitError.value = err instanceof ApiError ? err.message : 'Não foi possível bloquear o horário.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <AdminModal title="Bloquear horário" @close="emit('close')">
    <form class="block-form" @submit.prevent="onSubmit">
      <p class="block-form__hint">O período some dos horários do site. Atendimentos já marcados nele continuam valendo.</p>

      <label class="admin-field">
        {{ allDay ? 'De' : 'Dia' }}
        <AdminDatePicker v-model="startDate" :min="todayKey" />
      </label>

      <label class="block-form__toggle">
        <input v-model="allDay" type="checkbox" />
        Dia inteiro (ou vários dias)
      </label>

      <label v-if="allDay" class="admin-field">
        Até
        <AdminDatePicker v-model="endDate" :min="startDate" />
      </label>

      <div v-else class="block-form__times">
        <label class="admin-field">
          Das
          <input v-model="startTime" type="time" step="300" required />
        </label>
        <label class="admin-field">
          Até
          <input v-model="endTime" type="time" step="300" required />
        </label>
      </div>
      <p v-if="invalid && startTime && endTime" class="admin-error">O fim precisa ser depois do início.</p>

      <label class="admin-field">
        Motivo (opcional)
        <input v-model="reason" type="text" maxlength="200" placeholder="Almoço, curso, folga…" />
      </label>

      <p v-if="submitError" class="admin-error">{{ submitError }}</p>
      <button type="submit" class="button button--primary" :disabled="submitting || invalid">
        {{ submitting ? 'Bloqueando…' : 'Bloquear horário' }}
      </button>
    </form>
  </AdminModal>
</template>

<style scoped>
.block-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.block-form__hint {
  margin: 0;
  font-size: 0.9rem;
  color: var(--color-ink-muted);
}

.block-form__toggle {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.block-form__toggle input {
  width: 18px;
  height: 18px;
  accent-color: var(--color-rose-700);
}

.block-form__times {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.admin-error {
  margin: 0;
  color: var(--color-danger);
  font-size: 0.85rem;
}
</style>
