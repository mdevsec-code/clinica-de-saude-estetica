<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useBookingStore } from '@/stores/booking';
import { fetchCategories } from '@/services/catalog.service';
import { fetchAvailableSlots } from '@/services/availability.service';
import { createAppointment } from '@/services/appointments.service';
import { ApiError } from '@/services/api';
import type { Service, ServiceCategory, Slot } from '@/types';
import BookingProgress from '@/components/BookingProgress.vue';
import PageHeroBand from '@/components/PageHeroBand.vue';
import CategoryAccordion from '@/components/CategoryAccordion.vue';
import LoadingState from '@/components/LoadingState.vue';
import EmptyState from '@/components/EmptyState.vue';
import BookingSummaryBar from '@/components/BookingSummaryBar.vue';
import { applyStaggerReveal } from '@/composables/useStaggerReveal';
import { applyMagneticButtons } from '@/composables/useMagneticButton';
import { gsap } from '@/lib/motion';
import { refreshScroll } from '@/composables/useSmoothScroll';

const booking = useBookingStore();

// --- Etapa 1: serviço (caso o cliente chegue direto em /agendar) ---
const categories = ref<ServiceCategory[]>([]);
const loadingCategories = ref(false);

async function loadCategories() {
  loadingCategories.value = true;
  try {
    const { categories: data } = await fetchCategories();
    categories.value = data;
  } catch {
    // Sem catch aqui, uma falha de rede virava uma rejeição de Promise não
    // tratada (loadCategories é chamada sem await/catch no onMounted) —
    // o estado vazio já existente no template cobre esse caso normalmente.
    categories.value = [];
  } finally {
    loadingCategories.value = false;
  }
  await nextTick();
  applyStaggerReveal('.booking-step__list', '.accordion');
  // A altura da página muda quando os acordeões entram/saem do DOM — sem
  // recalcular, o ScrollSmoother/ScrollTrigger ficariam com os limites de
  // scroll da versão anterior do conteúdo.
  refreshScroll();
}

// Data local em "yyyy-MM-dd" (NUNCA toISOString, que usa UTC): em Camaçari
// (UTC-3), entre ~21h e meia-noite locais o dia em UTC já virou o seguinte,
// então toISOString().slice(0,10) mostraria/enviaria o dia errado — um card
// marcado "29" enviando a data "30" para a API, por exemplo.
function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// --- Etapa 2: data ---
const DAYS_AHEAD = 21;
const dateOptions = computed(() => {
  const options: { value: string; weekday: string; day: string; month: string }[] = [];
  const today = new Date();
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const value = toLocalDateKey(date);
    options.push({
      value,
      weekday: date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
      day: date.toLocaleDateString('pt-BR', { day: '2-digit' }),
      month: date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
    });
  }
  return options;
});

// --- Etapa 3: horários ---
const slots = ref<Slot[]>([]);
const loadingSlots = ref(false);
const slotsError = ref<string | null>(null);
const searchedEmptyDay = ref(false);

async function loadSlots(date: string) {
  if (!booking.selectedService) return;
  loadingSlots.value = true;
  slotsError.value = null;
  searchedEmptyDay.value = false;
  try {
    const { slots: result } = await fetchAvailableSlots(booking.selectedService.id, date);
    slots.value = result;
  } catch {
    slotsError.value = 'Não foi possível carregar os horários. Tente novamente.';
  } finally {
    loadingSlots.value = false;
  }
  await nextTick();
  refreshScroll();
}

watch(
  () => booking.selectedDate,
  (date) => {
    if (date) loadSlots(date);
  },
);

async function findNextAvailableDay() {
  if (!booking.selectedService) return;
  searchedEmptyDay.value = true;
  loadingSlots.value = true;
  const today = new Date();
  for (let i = 1; i <= 30; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const value = toLocalDateKey(date);
    try {
      const { slots: result } = await fetchAvailableSlots(booking.selectedService.id, value);
      if (result.length > 0) {
        booking.selectDate(value);
        slots.value = result;
        loadingSlots.value = false;
        await nextTick();
        refreshScroll();
        return;
      }
    } catch {
      break;
    }
  }
  loadingSlots.value = false;
}

const formattedSelectedDate = computed(() => {
  if (!booking.selectedDate) return '';
  const [year, month, day] = booking.selectedDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
});

function formatSlotTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bahia',
  });
}

// --- Etapa 4: dados do cliente ---
const formErrors = ref<Record<string, string>>({});

function validateDetails() {
  const errors: Record<string, string> = {};
  if (booking.customer.name.trim().length < 2) {
    errors.name = 'Informe seu nome completo.';
  }
  const digits = booking.customer.whatsapp.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) {
    errors.whatsapp = 'Informe um WhatsApp válido, com DDD.';
  }
  formErrors.value = errors;
  return Object.keys(errors).length === 0;
}

function goToConfirmation() {
  if (validateDetails()) {
    step.value = 'confirmation';
  }
}

// --- Navegação entre "sub-passos" visuais (a store já expõe currentStep, mas
// a etapa de "dados" e "confirmação" ficam na mesma view, então controlamos
// um passo visual local só para essas duas). ---
const step = ref<'service' | 'date' | 'time' | 'details' | 'confirmation' | 'success'>('service');

watch(
  () => booking.currentStep,
  (value) => {
    if (value !== 'confirmation') step.value = value;
  },
  { immediate: true },
);

// Cada etapa troca de <section> inteira (ver o v-if/v-else-if no template) —
// os botões/CTAs de cada uma só existem no DOM depois da troca, então o
// magnetismo precisa ser reaplicado a cada mudança de passo. O selo de
// sucesso ganha uma entrada com leve "quique" (CustomBounce, registrado em
// lib/motion.ts) em vez de um simples fade, para marcar o momento como o
// ponto alto do fluxo inteiro.
watch(step, async (value) => {
  await nextTick();
  applyMagneticButtons('.booking-page .button--primary, .booking-page .button--ghost');
  refreshScroll();

  if (value === 'success') {
    const check = document.querySelector('.success-check');
    if (check && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.from(check, { scale: 0, opacity: 0, duration: 0.9, ease: 'premium-bounce' });
    }
  }
});

onMounted(() => {
  // Sempre carrega as categorias, mesmo quando o cliente já chega com um
  // serviço pré-selecionado (vindo de /servicos): se ele usar "← Voltar" até
  // a etapa de serviço, a lista precisa estar pronta — carregar só quando
  // selectedService está vazio deixava essa volta com a tela de "nenhum
  // serviço disponível" mesmo havendo serviços de verdade.
  loadCategories();
  if (booking.selectedDate) loadSlots(booking.selectedDate);
});

function handleSelectService(service: Service) {
  booking.selectService(service);
}

// --- Confirmação e envio ---
const submitting = ref(false);
const submitError = ref<string | null>(null);

async function confirmBooking() {
  if (!booking.selectedService || !booking.selectedSlot) return;
  submitting.value = true;
  submitError.value = null;
  try {
    const { appointment } = await createAppointment({
      serviceId: booking.selectedService.id,
      startAt: booking.selectedSlot.startAt,
      customer: booking.customer,
      notes: booking.notes || undefined,
    });
    booking.confirmedAppointmentId = appointment.id;
    step.value = 'success';
  } catch (err) {
    if (err instanceof ApiError) {
      submitError.value = err.message;
      if (err.status === 409 && booking.selectedDate) {
        // horário foi tomado por outra pessoa: recarrega a grade antes do cliente tentar de novo
        await loadSlots(booking.selectedDate);
        booking.selectedSlot = null;
      }
    } else {
      submitError.value = 'Não foi possível concluir o agendamento. Tente novamente.';
    }
  } finally {
    submitting.value = false;
  }
}

function startOver() {
  booking.reset();
  step.value = 'service';
  loadCategories();
}

function goBack() {
  if (step.value === 'date') booking.goBackTo('service');
  else if (step.value === 'time') booking.goBackTo('date');
  else if (step.value === 'details') booking.goBackTo('time');
  else if (step.value === 'confirmation') step.value = 'details';
}
</script>

<template>
  <div class="booking-page">
    <PageHeroBand eyebrow="Reserve seu horário" title="Agendamento">
      <BookingProgress v-if="step !== 'success'" :current="booking.currentStep" />
    </PageHeroBand>

    <div class="container booking-page__inner">
      <button v-if="!['service', 'success'].includes(step)" type="button" class="back-link" @click="goBack">
        ← Voltar
      </button>

      <Transition name="step" mode="out-in">
      <section v-if="step === 'service'" class="booking-step" key="service">
        <h1>Escolha o procedimento</h1>
        <LoadingState v-if="loadingCategories" label="Carregando serviços…" />
        <EmptyState v-else-if="!categories.length" title="Nenhum serviço disponível no momento." />
        <div v-else class="booking-step__list">
          <CategoryAccordion
            v-for="category in categories"
            :key="category.id"
            :category="category"
            :selected-service-id="booking.selectedService?.id"
            :default-open="categories[0]?.id === category.id"
            @select-service="handleSelectService"
          />
        </div>
      </section>

      <section v-else-if="step === 'date'" class="booking-step" key="date">
        <h1>Escolha o dia</h1>
        <div class="date-strip" role="listbox" aria-label="Datas disponíveis">
          <button
            v-for="option in dateOptions"
            :key="option.value"
            type="button"
            class="date-chip"
            :class="{ 'date-chip--selected': booking.selectedDate === option.value }"
            @click="booking.selectDate(option.value)"
          >
            <span class="date-chip__weekday">{{ option.weekday }}</span>
            <span class="date-chip__day">{{ option.day }}</span>
            <span class="date-chip__month">{{ option.month }}</span>
          </button>
        </div>
      </section>

      <section v-else-if="step === 'time'" class="booking-step" key="time">
        <h1>Escolha o horário</h1>
        <LoadingState v-if="loadingSlots" label="Buscando horários…" />
        <EmptyState
          v-else-if="slotsError"
          title="Algo deu errado"
          :description="slotsError"
          action-label="Tentar novamente"
          @action="() => booking.selectedDate && loadSlots(booking.selectedDate)"
        />
        <EmptyState
          v-else-if="!slots.length"
          title="Não encontramos horários disponíveis neste dia."
          :action-label="searchedEmptyDay ? undefined : 'Ver próximo dia disponível'"
          @action="findNextAvailableDay"
        />
        <div v-else class="time-grid">
          <button
            v-for="slot in slots"
            :key="slot.startAt"
            type="button"
            class="time-chip"
            :class="{ 'time-chip--selected': booking.selectedSlot?.startAt === slot.startAt }"
            @click="booking.selectSlot(slot)"
          >
            {{ formatSlotTime(slot.startAt) }}
          </button>
        </div>
      </section>

      <section v-else-if="step === 'details'" class="booking-step" key="details">
        <h1>Seus dados</h1>
        <form class="details-form" @submit.prevent="goToConfirmation">
          <label>
            Nome completo
            <input v-model="booking.customer.name" type="text" autocomplete="name" required />
            <span v-if="formErrors.name" class="field-error">{{ formErrors.name }}</span>
          </label>
          <label>
            WhatsApp (com DDD)
            <input v-model="booking.customer.whatsapp" type="tel" inputmode="numeric" placeholder="71999999999" autocomplete="tel" required />
            <span v-if="formErrors.whatsapp" class="field-error">{{ formErrors.whatsapp }}</span>
          </label>
          <label>
            E-mail (opcional)
            <input v-model="booking.customer.email" type="email" autocomplete="email" />
          </label>
          <label>
            Observações (opcional)
            <textarea v-model="booking.notes" rows="3" maxlength="500" />
          </label>
          <button type="submit" class="button button--primary">Continuar</button>
        </form>
      </section>

      <section v-else-if="step === 'confirmation'" class="booking-step" key="confirmation">
        <h1>Confira e confirme</h1>
        <div class="confirmation-card">
          <p class="confirmation-card__row"><strong>Procedimento:</strong> {{ booking.selectedService?.name }}</p>
          <p class="confirmation-card__row"><strong>Data:</strong> {{ formattedSelectedDate }}</p>
          <p class="confirmation-card__row">
            <strong>Horário:</strong> {{ booking.selectedSlot && formatSlotTime(booking.selectedSlot.startAt) }}
          </p>
          <p class="confirmation-card__row"><strong>Duração:</strong> {{ booking.selectedService?.durationMinutes }} min</p>
          <p class="confirmation-card__row">
            <strong>Valor:</strong>
            {{ booking.selectedService?.price != null ? booking.selectedService.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Consulte' }}
          </p>
          <p class="confirmation-card__row"><strong>Nome:</strong> {{ booking.customer.name }}</p>
          <p class="confirmation-card__row"><strong>WhatsApp:</strong> {{ booking.customer.whatsapp }}</p>
        </div>
        <p v-if="submitError" class="field-error">{{ submitError }}</p>
        <button type="button" class="button button--primary" :disabled="submitting" @click="confirmBooking">
          {{ submitting ? 'Confirmando…' : 'Confirmar atendimento' }}
        </button>
      </section>

      <section v-else-if="step === 'success'" class="booking-step booking-step--success" key="success">
        <p class="success-check" aria-hidden="true">✓</p>
        <h1>Atendimento confirmado</h1>
        <p>Seu horário foi reservado. Em breve você recebe a confirmação também pelo WhatsApp.</p>
        <button type="button" class="button button--ghost" @click="startOver">Fazer novo agendamento</button>
      </section>
      </Transition>
    </div>

    <!--
      A etapa "details" tem seu próprio botão de envio no formulário (com
      validação) — mostrar esta barra ali também criaria dois "Continuar" na
      tela, um funcional e um redundante (que não avançaria nada de verdade).
    -->
    <BookingSummaryBar
      v-if="step === 'date' || step === 'time'"
      :cta-label="step === 'date' ? 'Ver horários' : 'Continuar'"
      :cta-disabled="(step === 'date' && !booking.selectedDate) || (step === 'time' && !booking.selectedSlot)"
      @continue="step = step === 'date' ? 'time' : 'details'"
    />
    <BookingSummaryBar
      v-else-if="step === 'service' && booking.selectedService"
      cta-label="Continuar"
      @continue="step = 'date'"
    />
  </div>
</template>

<style scoped>
.booking-page__inner {
  padding-block: var(--space-5) var(--space-8);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.back-link {
  align-self: flex-start;
  background: none;
  border: none;
  color: var(--color-rose-700);
  font-weight: 600;
  font-size: 0.9rem;
  padding: var(--space-2) 0;
  cursor: pointer;
}

.step-enter-active,
.step-leave-active {
  transition: opacity 0.28s var(--ease-standard), transform 0.28s var(--ease-standard);
}

.step-enter-from {
  opacity: 0;
  transform: translateY(14px);
}

.step-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

@media (prefers-reduced-motion: reduce) {
  .step-enter-active,
  .step-leave-active {
    transition: none;
  }
}

.booking-step h1 {
  font-size: 1.8rem;
  margin-bottom: var(--space-5);
}

.booking-step__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.date-strip {
  display: flex;
  gap: var(--space-2);
  overflow-x: auto;
  padding-bottom: var(--space-2);
}

.date-chip {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 68px;
  padding: var(--space-3) var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  cursor: pointer;
  text-transform: capitalize;
}

.date-chip--selected {
  border-color: var(--color-rose-700);
  background: var(--color-rose-700);
  color: #fff;
}

.date-chip__weekday {
  font-size: 0.8rem;
  opacity: 0.75;
}

.date-chip__day {
  font-size: 1.2rem;
  font-weight: 700;
}

.date-chip__month {
  font-size: 0.8rem;
  opacity: 0.75;
}

.time-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
}

.time-chip {
  padding: 12px 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  font-weight: 600;
  cursor: pointer;
}

.time-chip--selected {
  border-color: var(--color-rose-700);
  background: var(--color-rose-700);
  color: #fff;
}

.details-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 480px;
}

.details-form label {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--color-ink);
}

.details-form input,
.details-form textarea {
  font-family: inherit;
  font-size: 1rem;
  font-weight: 400;
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
}

.field-error {
  color: var(--color-danger);
  font-size: 0.8rem;
  font-weight: 500;
}

.confirmation-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-5);
  max-width: 480px;
}

.booking-step--success {
  text-align: center;
  padding-block: var(--space-8);
}

.success-check {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--color-success);
  color: #fff;
  font-size: 1.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto var(--space-5);
}

@media (min-width: 600px) {
  .time-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
</style>
