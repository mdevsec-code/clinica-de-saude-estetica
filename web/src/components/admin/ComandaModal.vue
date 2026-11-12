<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import AdminModal from './AdminModal.vue';
import AdminSelect, { type AdminSelectGroup, type AdminSelectOption } from './AdminSelect.vue';
import { checkoutAppointments, fetchCardFees, updateAppointmentStatus, type CardFees } from '@/services/admin-appointments.service';
import { createInternalAppointment } from '@/services/appointments.service';
import { fetchCategories } from '@/services/catalog.service';
import { ApiError } from '@/services/api';
import type { AdminAppointment, ServiceCategory } from '@/types';

// Comanda de uma visita: os serviços da mesma paciente no mesmo dia, com
// valor editável, forma de pagamento e "Finalizar comanda" (conclui os
// atendimentos e grava quanto entrou e como — é o que o Financeiro soma).
const props = defineProps<{ visit: AdminAppointment[] }>();
const emit = defineEmits<{ close: []; changed: [] }>();

const TIMEZONE = 'America/Bahia';
// Mesma lista do servidor (server/src/modules/finance/payment-methods.ts).
const METHOD_LABELS: Record<string, string> = {
  DINHEIRO: 'Dinheiro',
  PIX: 'Pix',
  TRANSFERENCIA: 'Transferência',
  DEBITO: 'Cartão débito',
  CREDITO: 'Cartão crédito',
  PARCELADO: 'Crédito parcelado',
  VALE: 'Vale-presente',
  CORTESIA: 'Cortesia',
};
const FEE_FIELD: Record<string, keyof CardFees> = { DEBITO: 'cardFeeDebitBps', CREDITO: 'cardFeeCreditBps', PARCELADO: 'cardFeeInstallmentBps' };
const methodOptions: AdminSelectOption[] = Object.entries(METHOD_LABELS).map(([value, label]) => ({ value, label }));
const paymentOptions: AdminSelectOption[] = [...methodOptions, { value: 'COMBINADO', label: 'Combinar 2 métodos' }];

const first = computed(() => props.visit[0]);
const finished = computed(() => props.visit.every((a) => a.status === 'COMPLETED'));

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TIMEZONE });
}
const dayLabel = computed(() =>
  new Date(first.value.startAt).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: TIMEZONE }),
);
const totalMinutes = computed(() => props.visit.reduce((sum, a) => sum + a.service.durationMinutes, 0));

// --- Valores (em centavos; o campo mostra "30,00") ---
const prices = reactive<Record<string, string>>({});
function centsToInput(cents: number) {
  return (cents / 100).toFixed(2).replace('.', ',');
}
function inputToCents(value: string) {
  const n = Number(value.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
}
function formatBRL(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
watch(
  () => props.visit.map((a) => a.id).join(),
  () => {
    for (const a of props.visit) {
      if (!(a.id in prices)) prices[a.id] = centsToInput(a.chargedCents ?? a.service.priceCents ?? 0);
    }
  },
  { immediate: true },
);
const totalCents = computed(() => props.visit.reduce((sum, a) => sum + inputToCents(prices[a.id] ?? '0'), 0));

// --- Pagamento ---
const payment = ref('');
const splitA = ref('PIX');
const splitB = ref('CREDITO');
const splitAInput = ref('');
const splitACents = computed(() => Math.min(inputToCents(splitAInput.value), totalCents.value));
const splitBCents = computed(() => totalCents.value - splitACents.value);

// Prévia da taxa da maquininha (o servidor recalcula ao finalizar).
const cardFees = ref<CardFees | null>(null);
onMounted(async () => {
  try {
    cardFees.value = (await fetchCardFees()).cardFees;
  } catch {
    cardFees.value = null;
  }
});
const payments = computed(() =>
  payment.value === 'COMBINADO'
    ? [
        { method: splitA.value, amountCents: splitACents.value },
        { method: splitB.value, amountCents: splitBCents.value },
      ]
    : [{ method: payment.value, amountCents: totalCents.value }],
);
function feeOf(method: string, amountCents: number) {
  const field = FEE_FIELD[method];
  return field && cardFees.value ? Math.round((amountCents * cardFees.value[field]) / 10_000) : 0;
}
const feePreviewCents = computed(() => (payment.value ? payments.value.reduce((sum, p) => sum + feeOf(p.method, p.amountCents), 0) : 0));
const feePreviewLabel = computed(() => {
  const pcts = payments.value
    .filter((p) => FEE_FIELD[p.method] && cardFees.value)
    .map((p) => `${METHOD_LABELS[p.method]} ${(cardFees.value![FEE_FIELD[p.method]] / 100).toLocaleString('pt-BR')}%`);
  return pcts.join(' + ');
});

const paymentReady = computed(() => {
  if (payment.value === 'COMBINADO') return splitA.value !== splitB.value && splitACents.value > 0 && splitBCents.value > 0;
  return !!payment.value;
});

// --- Serviços: adicionar (entra colado no fim da visita) e tirar ---
const categories = ref<ServiceCategory[]>([]);
onMounted(async () => {
  try {
    categories.value = (await fetchCategories()).categories;
  } catch {
    categories.value = [];
  }
});
const serviceGroups = computed<AdminSelectGroup[]>(() =>
  categories.value
    .filter((c) => c.services.length)
    .map((c) => ({ label: c.name, options: c.services.map((s) => ({ value: s.id, label: `${s.name} (${s.durationMinutes} min)` })) })),
);
const addingServiceId = ref('');
const busy = ref(false);
const error = ref<string | null>(null);

watch(addingServiceId, async (serviceId) => {
  if (!serviceId) return;
  busy.value = true;
  error.value = null;
  try {
    await createInternalAppointment({
      serviceIds: [serviceId],
      startAt: props.visit[props.visit.length - 1].endAt,
      customer: { name: first.value.customer.name, whatsapp: first.value.customer.whatsapp },
    });
    emit('changed');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Não foi possível adicionar o serviço.';
  } finally {
    addingServiceId.value = '';
    busy.value = false;
  }
});

const confirmingRemove = ref<string | null>(null);
async function removeService(appt: AdminAppointment) {
  if (confirmingRemove.value !== appt.id) {
    confirmingRemove.value = appt.id;
    return;
  }
  confirmingRemove.value = null;
  busy.value = true;
  error.value = null;
  try {
    await updateAppointmentStatus(appt.id, 'CANCELLED');
    emit('changed');
    if (props.visit.length === 1) emit('close');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Não foi possível tirar o serviço.';
  } finally {
    busy.value = false;
  }
}

// --- Finalizar ---
async function finish() {
  if (!paymentReady.value) return;
  busy.value = true;
  error.value = null;
  try {
    await checkoutAppointments({
      items: props.visit.map((a) => ({ id: a.id, chargedCents: inputToCents(prices[a.id] ?? '0') })),
      payments: payments.value,
    });
    emit('changed');
    emit('close');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Não foi possível finalizar a comanda.';
  } finally {
    busy.value = false;
  }
}

const paidLabel = computed(() => {
  const a = first.value;
  const method = a.paymentNote || (a.paymentMethod ? METHOD_LABELS[a.paymentMethod] ?? a.paymentMethod : 'Forma de pagamento não registrada');
  const fee = props.visit.reduce((sum, v) => sum + (v.feeCents ?? 0), 0);
  return fee ? `${method} · taxa ${formatBRL(fee)}` : method;
});

const whatsappHref = computed(() => {
  const digits = first.value.customer.whatsapp.replace(/\D/g, '');
  return `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}`;
});
</script>

<template>
  <AdminModal :title="finished ? 'Comanda finalizada' : 'Comanda'" wide @close="emit('close')">
    <div class="comanda">
      <section class="comanda__col">
        <div class="comanda__client">
          <span class="comanda__avatar" aria-hidden="true">{{ first.customer.name.trim().charAt(0).toUpperCase() }}</span>
          <div class="comanda__who">
            <p class="comanda__name">{{ first.customer.name }}</p>
            <p class="comanda__when">
              <span class="comanda__day">{{ dayLabel }}</span> · {{ formatTime(first.startAt) }}–{{ formatTime(visit[visit.length - 1].endAt) }} ·
              {{ totalMinutes }} min
            </p>
          </div>
        </div>

        <ul class="comanda__items">
          <li v-for="appt in visit" :key="appt.id" class="comanda__item">
            <span class="comanda__service">
              {{ appt.service.name }}
              <small>{{ formatTime(appt.startAt) }} · {{ appt.service.durationMinutes }} min</small>
            </span>
            <label class="comanda__price">
              <span>R$</span>
              <input v-model="prices[appt.id]" type="text" inputmode="decimal" :disabled="finished || busy" :aria-label="`Valor de ${appt.service.name}`" />
            </label>
            <button
              v-if="!finished"
              type="button"
              class="comanda__remove"
              :class="{ 'comanda__remove--confirm': confirmingRemove === appt.id }"
              :disabled="busy"
              :aria-label="`Tirar ${appt.service.name}`"
              @click="removeService(appt)"
            >
              {{ confirmingRemove === appt.id ? 'Tirar?' : '×' }}
            </button>
          </li>
        </ul>

        <AdminSelect v-if="!finished" v-model="addingServiceId" :options="serviceGroups" placeholder="+ Adicionar serviço" :disabled="busy" />
      </section>

      <section class="comanda__col comanda__col--pay">
        <div class="comanda__total">
          <span>{{ finished ? 'Total pago' : 'Total a coletar' }}</span>
          <strong>{{ formatBRL(totalCents) }}</strong>
        </div>

        <p v-if="finished" class="comanda__paid">Pago · {{ paidLabel }}</p>
        <template v-else>
          <AdminSelect v-model="payment" :options="paymentOptions" placeholder="Selecione a forma de pagamento" />

          <div v-if="payment === 'COMBINADO'" class="comanda__split">
            <div class="comanda__split-row">
              <AdminSelect v-model="splitA" :options="methodOptions" />
              <label class="comanda__price">
                <span>R$</span>
                <input v-model="splitAInput" type="text" inputmode="decimal" placeholder="0,00" aria-label="Valor no primeiro método" />
              </label>
            </div>
            <div class="comanda__split-row">
              <AdminSelect v-model="splitB" :options="methodOptions" />
              <span class="comanda__rest">{{ formatBRL(splitBCents) }}</span>
            </div>
            <p v-if="splitA === splitB" class="comanda__hint">Escolha dois métodos diferentes.</p>
          </div>

          <div v-if="feePreviewCents > 0" class="comanda__fee">
            <span>Taxa da maquininha ({{ feePreviewLabel }})</span>
            <span>− {{ formatBRL(feePreviewCents) }}</span>
            <strong>Você recebe</strong>
            <strong>{{ formatBRL(totalCents - feePreviewCents) }}</strong>
          </div>
        </template>

        <p v-if="error" class="admin-error">{{ error }}</p>

        <div class="comanda__actions">
          <button v-if="!finished" type="button" class="button button--primary comanda__finish" :disabled="busy || !paymentReady" @click="finish">
            {{ busy ? 'Salvando…' : 'Finalizar comanda' }}
          </button>
          <a class="button button--ghost" :href="whatsappHref" target="_blank" rel="noopener">WhatsApp</a>
        </div>
      </section>
    </div>
  </AdminModal>
</template>

<style scoped>
.comanda {
  display: grid;
  gap: var(--space-4);
}

/* Duas colunas a partir de tablet/computador: a comanda inteira cabe na
   tela sem rolar. No celular, uma coluna só. */
@media (min-width: 620px) {
  .comanda {
    grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
    gap: var(--space-5);
    align-items: start;
  }
}

.comanda__col {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

.comanda__when {
  margin: 0;
  color: var(--color-ink-muted);
  font-size: 0.85rem;
}

.comanda__day {
  text-transform: capitalize;
}

.comanda__who {
  min-width: 0;
}

.comanda__client {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.comanda__avatar {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--color-rose-100);
  color: var(--color-rose-900);
  font-weight: 700;
}

.comanda__name {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.comanda__items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.comanda__item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--space-2);
  padding: 6px 6px 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
}

.comanda__service {
  display: flex;
  flex-direction: column;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.comanda__service small {
  font-weight: 400;
  font-size: 0.8rem;
  color: var(--color-ink-muted);
}

.comanda__price {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.85rem;
  color: var(--color-ink-muted);
}

.comanda__price input {
  width: 86px;
  font: inherit;
  font-size: 0.95rem;
  color: var(--color-ink);
  text-align: right;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
}

.comanda__price input:focus-visible {
  border-color: var(--color-rose-700);
  box-shadow: 0 0 0 3px var(--color-rose-100);
  outline: none;
}

.comanda__remove {
  min-width: 36px;
  height: 36px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius-pill);
  background: none;
  font-size: 1.1rem;
  color: var(--color-ink-muted);
  cursor: pointer;
}

.comanda__remove--confirm {
  font-size: 0.8rem;
  font-weight: 600;
  color: #fff;
  background: var(--color-danger);
}

.comanda__total {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  background: var(--color-surface-muted);
}

.comanda__total {
  color: var(--color-success, #2f7d4f);
  font-weight: 600;
}

.comanda__total strong {
  font-size: 1.25rem;
}

.comanda__split {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.comanda__split-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-2);
}

.comanda__rest {
  min-width: 112px;
  text-align: right;
  font-weight: 600;
}

.comanda__fee {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  color: var(--color-ink-muted);
}

.comanda__fee strong {
  color: var(--color-ink);
}

.comanda__hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-danger);
}

.comanda__paid {
  margin: 0;
  font-weight: 600;
  color: var(--color-success, #2f7d4f);
}

.comanda__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.comanda__actions > * {
  flex: 1 1 140px;
  justify-content: center;
}

.comanda__finish {
  flex-basis: 100%;
}

.admin-error {
  margin: 0;
  color: var(--color-danger);
  font-size: 0.85rem;
}
</style>
