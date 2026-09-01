<script setup lang="ts">
import { ref } from 'vue';
import type { AdminAppointment, AppointmentStatus } from '@/types';
import { updateAppointmentStatus } from '@/services/admin-appointments.service';
import { ApiError } from '@/services/api';
import EmptyState from '@/components/EmptyState.vue';

defineProps<{ appointments: AdminAppointment[] }>();

const pendingId = ref<string | null>(null);
const errorId = ref<string | null>(null);

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  CONFIRMED: 'Confirmado',
  CANCELLED: 'Cancelado',
  COMPLETED: 'Concluído',
  NO_SHOW: 'Não compareceu',
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bahia' });
}

function whatsappLink(phone: string) {
  return `https://wa.me/${phone.replace(/\D/g, '')}`;
}

// Muta o próprio objeto do agendamento (a mesma referência reativa vinda do
// array carregado em AdminAgendaView) em vez de emitir um evento — assim a
// grade do calendário por trás do modal e esta lista sempre mostram o mesmo
// estado, sem precisar sincronizar duas cópias manualmente.
async function setStatus(appointment: AdminAppointment, status: AppointmentStatus) {
  if (status === 'CANCELLED' && !confirm(`Cancelar o atendimento de ${appointment.customer.name}?`)) return;
  pendingId.value = appointment.id;
  errorId.value = null;
  try {
    await updateAppointmentStatus(appointment.id, status);
    appointment.status = status;
  } catch (err) {
    errorId.value = appointment.id;
  } finally {
    pendingId.value = null;
  }
}
</script>

<template>
  <EmptyState v-if="!appointments.length" title="Nenhum atendimento neste dia." />
  <ul v-else class="day-list">
    <li v-for="appt in appointments" :key="appt.id" class="day-item">
      <div class="day-item__main">
        <span class="day-item__time">{{ formatTime(appt.startAt) }}</span>
        <div class="day-item__body">
          <span class="day-item__name">
            {{ appt.customer.name }}
            <span
              class="day-item__strike"
              :style="{ transform: appt.status === 'CANCELLED' ? 'scaleX(1)' : 'scaleX(0)' }"
              aria-hidden="true"
            />
          </span>
          <span class="day-item__service">{{ appt.service.name }} · {{ appt.service.durationMinutes }} min</span>
          <a class="day-item__whatsapp" :href="whatsappLink(appt.customer.whatsapp)" target="_blank" rel="noopener">
            {{ appt.customer.whatsapp }}
          </a>
          <span v-if="appt.notes" class="day-item__notes">Obs.: {{ appt.notes }}</span>
        </div>
        <span class="admin-badge" :class="`admin-badge--${appt.status.toLowerCase()}`">
          {{ STATUS_LABELS[appt.status] }}
        </span>
      </div>

      <div class="day-item__actions">
        <template v-if="appt.status === 'CONFIRMED'">
          <button type="button" class="day-item__action" :disabled="pendingId === appt.id" @click="setStatus(appt, 'COMPLETED')">
            Concluir
          </button>
          <button type="button" class="day-item__action" :disabled="pendingId === appt.id" @click="setStatus(appt, 'NO_SHOW')">
            Não compareceu
          </button>
          <button
            type="button"
            class="day-item__action day-item__action--danger"
            :disabled="pendingId === appt.id"
            @click="setStatus(appt, 'CANCELLED')"
          >
            {{ pendingId === appt.id ? 'Cancelando…' : 'Cancelar' }}
          </button>
        </template>
        <button v-else type="button" class="day-item__action" :disabled="pendingId === appt.id" @click="setStatus(appt, 'CONFIRMED')">
          Reverter para confirmado
        </button>
      </div>
      <p v-if="errorId === appt.id" class="day-item__error">Não foi possível atualizar. Tente novamente.</p>
    </li>
  </ul>
</template>

<style scoped>
.day-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.day-item {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  background: var(--color-surface);
}

.day-item__main {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
}

.day-item__time {
  flex-shrink: 0;
  font-weight: 700;
  color: var(--color-rose-700);
  min-width: 52px;
}

.day-item__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.day-item__name {
  position: relative;
  display: inline-block;
  width: fit-content;
  font-weight: 700;
  color: var(--color-ink);
}

.day-item__strike {
  position: absolute;
  left: -2px;
  right: -2px;
  top: 50%;
  height: 2px;
  background: currentColor;
  transform-origin: left center;
  transition: transform 0.5s var(--ease-premium);
  pointer-events: none;
}

.day-item__service {
  font-size: 0.85rem;
  color: var(--color-ink-muted);
}

.day-item__whatsapp {
  font-size: 0.85rem;
  color: var(--color-rose-700);
  font-weight: 600;
  width: fit-content;
}

.day-item__notes {
  font-size: 0.82rem;
  color: var(--color-ink-soft);
  font-style: italic;
}

.admin-badge {
  flex-shrink: 0;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  background: var(--color-rose-100);
  color: var(--color-rose-700);
}

.admin-badge--cancelled {
  background: var(--color-surface-muted);
  color: var(--color-ink-soft);
}

.admin-badge--completed {
  background: #e4ede6;
  color: var(--color-success);
}

.admin-badge--no_show {
  background: #f3e2df;
  color: var(--color-danger);
}

.day-item__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}

.day-item__action {
  background: none;
  border: none;
  color: var(--color-rose-700);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  padding: 0;
}

.day-item__action:hover {
  text-decoration: underline;
}

.day-item__action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.day-item__action--danger {
  color: var(--color-danger);
}

.day-item__error {
  margin: var(--space-2) 0 0;
  font-size: 0.82rem;
  color: var(--color-danger);
}
</style>
