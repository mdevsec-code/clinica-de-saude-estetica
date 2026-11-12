<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AdminAppointment, AdminBlockedTime, AppointmentStatus } from '@/types';
import { deleteBlockedTime, updateAppointmentStatus } from '@/services/admin-appointments.service';
import { ApiError } from '@/services/api';
import EmptyState from '@/components/EmptyState.vue';
import ComandaModal from './ComandaModal.vue';

// hideEmpty: usado pela linha do tempo para mostrar só um bloqueio, sem o
// aviso de "nenhum atendimento".
const props = defineProps<{ appointments: AdminAppointment[]; blocks?: AdminBlockedTime[]; hideEmpty?: boolean }>();
const emit = defineEmits<{ unblocked: []; changed: [] }>();

// Comanda: a visita é tudo da mesma paciente no mesmo dia (vários serviços
// viram um atendimento por serviço), menos os cancelados. Guarda só a chave
// — quando a agenda recarrega, a comanda aberta já mostra o que mudou.
const comandaKey = ref<string | null>(null);
function visitKey(appt: AdminAppointment) {
  const day = new Date(appt.startAt).toLocaleDateString('pt-BR', { timeZone: 'America/Bahia' });
  return `${appt.customerId}|${day}`;
}
const comandaVisit = computed(() =>
  comandaKey.value
    ? props.appointments.filter((a) => a.status !== 'CANCELLED' && visitKey(a) === comandaKey.value)
    : [],
);

const unblockingId = ref<string | null>(null);

async function unblock(block: AdminBlockedTime) {
  unblockingId.value = block.id;
  try {
    await deleteBlockedTime(block.id);
    emit('unblocked');
  } catch {
    // Mantém o bloqueio na tela; a próxima tentativa mostra de novo o botão.
  } finally {
    unblockingId.value = null;
  }
}

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

// Compromisso de dia inteiro (ou que atravessa vários dias, tipo férias)
// não tem um "horário" que faça sentido mostrar — só o período.
function formatBlockRange(block: AdminBlockedTime) {
  const start = new Date(block.startAt);
  const end = new Date(block.endAt);
  if (end.getTime() - start.getTime() >= 24 * 60 * 60 * 1000) {
    const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Bahia' });
    return `${fmt(start)} a ${fmt(new Date(end.getTime() - 1))}`;
  }
  return `${formatTime(block.startAt)}–${formatTime(block.endAt)}`;
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
  <ul v-if="blocks?.length" class="day-list day-list--blocks">
    <li v-for="block in blocks" :key="block.id" class="day-block">
      <span class="day-block__time">{{ formatBlockRange(block) }}</span>
      <span class="day-block__reason">{{ block.reason || 'Ocupado' }}</span>
      <span class="day-block__source">
        {{ block.source === 'MANUAL' ? 'Bloqueado no painel' : 'Google Agenda' }} · horário fechado no site
      </span>
      <button
        v-if="block.source === 'MANUAL'"
        type="button"
        class="day-block__unblock"
        :disabled="unblockingId === block.id"
        @click="unblock(block)"
      >
        {{ unblockingId === block.id ? 'Desbloqueando…' : 'Desbloquear' }}
      </button>
    </li>
  </ul>
  <EmptyState v-if="!appointments.length && !hideEmpty" title="Nenhum atendimento neste dia." />
  <ul v-else-if="appointments.length" class="day-list">
    <li v-for="appt in appointments" :key="appt.id" class="day-item">
      <div class="day-item__main">
        <span class="day-item__time">{{ formatTime(appt.startAt) }}</span>
        <div class="day-item__body">
          <button
            type="button"
            class="day-item__name"
            :disabled="appt.status === 'CANCELLED'"
            title="Abrir comanda"
            @click="comandaKey = visitKey(appt)"
          >
            {{ appt.customer.name }}
            <span
              class="day-item__strike"
              :style="{ transform: appt.status === 'CANCELLED' ? 'scaleX(1)' : 'scaleX(0)' }"
              aria-hidden="true"
            />
          </button>
          <span class="day-item__service">{{ appt.service.name }} · {{ appt.service.durationMinutes }} min</span>
          <a class="day-item__whatsapp" :href="whatsappLink(appt.customer.whatsapp)" target="_blank" rel="noopener">
            {{ appt.customer.whatsapp }}
          </a>
          <span v-if="appt.notes" class="day-item__notes">Obs.: {{ appt.notes }}</span>
        </div>
        <span class="day-item__badges">
          <span class="admin-badge" :class="`admin-badge--${appt.status.toLowerCase()}`">
            {{ STATUS_LABELS[appt.status] }}
          </span>
          <!-- Resposta à confirmação automática do WhatsApp (só para
               agendamentos ativos que de fato receberam a confirmação). -->
          <template v-if="appt.status === 'CONFIRMED'">
            <span v-if="appt.rescheduleOfferSentAt && appt.rescheduleProposedStartAt && !appt.rescheduleAcceptedAt" class="day-item__wa">
              Proposta de {{ formatTime(appt.rescheduleProposedStartAt) }} enviada · aguardando SIM
            </span>
            <span v-else-if="appt.rescheduleOfferSentAt && !appt.rescheduleProposedStartAt && !appt.rescheduleAcceptedAt" class="day-item__wa">
              Antes da abertura · remarcar à mão
            </span>
            <span v-if="appt.rescheduleAcceptedAt" class="day-item__wa day-item__wa--yes">Remarcado pelo WhatsApp ✓</span>
            <span v-if="appt.clientConfirmedAt" class="day-item__wa day-item__wa--yes">Paciente confirmou ✓</span>
            <span v-else-if="appt.confirmationSentAt" class="day-item__wa">Aguardando SIM</span>
          </template>
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
  <ComandaModal
    v-if="comandaKey && comandaVisit.length"
    :visit="comandaVisit"
    @close="comandaKey = null"
    @changed="emit('changed')"
  />
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

.day-list--blocks {
  margin-bottom: var(--space-3);
}

.day-block {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px var(--space-3);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface-muted);
  color: var(--color-ink-muted);
}

.day-block__time {
  font-weight: 700;
  min-width: 52px;
}

.day-block__reason {
  font-weight: 600;
  color: var(--color-ink);
}

.day-block__unblock {
  justify-self: start;
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-bg);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-rose-700);
  cursor: pointer;
}

.day-block__source {
  flex-basis: 100%;
  font-size: 0.78rem;
  color: var(--color-ink-soft);
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
  /* É um botão (abre a comanda), com cara de nome. */
  padding: 0;
  border: 0;
  background: none;
  font-size: inherit;
  text-align: left;
  text-decoration: underline;
  text-decoration-color: var(--color-rose-300);
  text-underline-offset: 3px;
  cursor: pointer;
}

.day-item__name:disabled {
  text-decoration: none;
  cursor: default;
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
  text-transform: none;
  letter-spacing: 0;
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

.day-item__badges {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}

.day-item__wa {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--color-gold-700);
  white-space: nowrap;
}

.day-item__wa--yes {
  color: var(--color-success);
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
