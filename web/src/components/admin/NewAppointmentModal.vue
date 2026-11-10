<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import AdminModal from './AdminModal.vue';
import AdminDatePicker from './AdminDatePicker.vue';
import { fetchCategories } from '@/services/catalog.service';
import { fetchAvailableSlots } from '@/services/availability.service';
import { createInternalAppointment } from '@/services/appointments.service';
import { fetchPatients } from '@/services/admin-patients.service';
import { ApiError } from '@/services/api';
import { toLocalDateKey } from '@/utils/calendar';
import type { PatientListItem, Service, ServiceCategory, Slot } from '@/types';

const props = defineProps<{ initialDate?: string }>();
const emit = defineEmits<{ close: []; created: [] }>();

const TIMEZONE = 'America/Bahia';
const TZ_OFFSET = '-03:00'; // Bahia não tem horário de verão.

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

const hasAnyService = computed(() => categories.value.some((c) => c.services.length > 0));

// --- Serviços: vários de uma vez, na ordem em que forem tocados ---
const selectedServices = ref<Service[]>([]);
const serviceSearch = ref('');
const pickerOpen = ref(true);

function normalize(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const filteredCategories = computed(() => {
  const term = normalize(serviceSearch.value.trim());
  return categories.value
    .map((category) => ({
      ...category,
      services: term
        ? category.services.filter((s) => normalize(`${s.name} ${category.name}`).includes(term))
        : category.services,
    }))
    .filter((c) => c.services.length > 0);
});

function isSelected(service: Service) {
  return selectedServices.value.some((s) => s.id === service.id);
}

function toggleService(service: Service) {
  selectedServices.value = isSelected(service)
    ? selectedServices.value.filter((s) => s.id !== service.id)
    : [...selectedServices.value, service];
}

const totalMinutes = computed(() => selectedServices.value.reduce((sum, s) => sum + s.durationMinutes, 0));
const totalPrice = computed(() => {
  if (selectedServices.value.some((s) => s.price == null)) return null;
  return selectedServices.value.reduce((sum, s) => sum + (s.price ?? 0), 0);
});

function formatPrice(value: number | null) {
  return value == null ? 'a avaliar' : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${m ? String(m).padStart(2, '0') : ''}` : `${m} min`;
}

// --- Data e horário: horários livres como sugestão + encaixe em qualquer horário ---
const todayKey = toLocalDateKey(new Date());
const date = ref(props.initialDate && props.initialDate >= todayKey ? props.initialDate : todayKey);
const time = ref('');
const slots = ref<Slot[]>([]);
const loadingSlots = ref(false);

function formatSlotTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TIMEZONE });
}

async function loadSlots() {
  if (!selectedServices.value.length || !date.value) {
    slots.value = [];
    return;
  }
  loadingSlots.value = true;
  try {
    const { slots: result } = await fetchAvailableSlots(selectedServices.value.map((s) => s.id), date.value);
    slots.value = result;
  } catch {
    slots.value = [];
  } finally {
    loadingSlots.value = false;
  }
}

watch([() => selectedServices.value.map((s) => s.id).join(), date], loadSlots);

const isOutsideSlots = computed(() => !!time.value && !slots.value.some((s) => formatSlotTime(s.startAt) === time.value));

// --- Cliente, com sugestão de quem já é paciente ---
const customer = reactive({ name: '', whatsapp: '', email: '' });
const notes = ref('');
const suggestions = ref<PatientListItem[]>([]);
const suggestFor = ref<'name' | 'whatsapp' | null>(null);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let searchSeq = 0;

function searchPatients(field: 'name' | 'whatsapp') {
  suggestFor.value = field;
  const raw = field === 'name' ? customer.name.trim() : customer.whatsapp.replace(/\D/g, '');
  clearTimeout(searchTimer);
  if (raw.length < 2) {
    suggestions.value = [];
    return;
  }
  searchTimer = setTimeout(async () => {
    const seq = ++searchSeq;
    try {
      const { patients } = await fetchPatients(raw);
      if (seq === searchSeq) suggestions.value = patients.slice(0, 6);
    } catch {
      suggestions.value = [];
    }
  }, 250);
}

function pickPatient(patient: PatientListItem) {
  customer.name = patient.name;
  customer.whatsapp = patient.whatsapp;
  customer.email = patient.email ?? '';
  suggestions.value = [];
  suggestFor.value = null;
}

function closeSuggestions() {
  // Atraso para o toque na sugestão ser registrado antes de o blur fechar a lista.
  setTimeout(() => (suggestFor.value = null), 150);
}

function formatPhone(digits: string) {
  const d = digits.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digits;
}

// --- Envio ---
const submitting = ref(false);
const submitError = ref<string | null>(null);
const canSubmit = computed(
  () => selectedServices.value.length > 0 && !!date.value && /^\d{2}:\d{2}$/.test(time.value) && customer.name.trim().length >= 2,
);

async function onSubmit() {
  if (!canSubmit.value) return;
  submitting.value = true;
  submitError.value = null;
  try {
    await createInternalAppointment({
      serviceIds: selectedServices.value.map((s) => s.id),
      startAt: `${date.value}T${time.value}:00${TZ_OFFSET}`,
      customer: {
        name: customer.name.trim(),
        whatsapp: customer.whatsapp.replace(/\D/g, ''),
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
      <p>Nenhum serviço cadastrado ainda. Cadastre ao menos um serviço para poder agendar um atendimento.</p>
      <RouterLink to="/admin/servicos" class="button button--primary" @click="emit('close')">Ir para Serviços</RouterLink>
    </div>

    <form v-else class="new-appt" @submit.prevent="onSubmit">
      <section class="new-appt__block">
        <div class="new-appt__block-head">
          <span class="new-appt__label">Serviços</span>
          <button v-if="selectedServices.length" type="button" class="new-appt__link" @click="pickerOpen = !pickerOpen">
            {{ pickerOpen ? 'Fechar lista' : '+ Adicionar serviço' }}
          </button>
        </div>

        <ul v-if="selectedServices.length" class="new-appt__chosen">
          <li v-for="service in selectedServices" :key="service.id">
            <span class="new-appt__chosen-name">{{ service.name }}</span>
            <span class="new-appt__chosen-meta">{{ formatDuration(service.durationMinutes) }} · {{ formatPrice(service.price) }}</span>
            <button type="button" class="new-appt__remove" :aria-label="`Tirar ${service.name}`" @click="toggleService(service)">×</button>
          </li>
          <li class="new-appt__total">
            <span>Total</span>
            <span>{{ formatDuration(totalMinutes) }} · {{ formatPrice(totalPrice) }}</span>
          </li>
        </ul>

        <div v-if="pickerOpen || !selectedServices.length" class="new-appt__picker">
          <input
            v-model="serviceSearch"
            type="search"
            class="new-appt__search"
            placeholder="Buscar serviço"
            aria-label="Buscar serviço"
            :disabled="loadingCategories"
          />
          <p v-if="loadingCategories" class="new-appt__hint">Carregando serviços…</p>
          <div v-else class="new-appt__service-list">
            <p v-if="!filteredCategories.length" class="new-appt__hint">Nenhum serviço encontrado.</p>
            <div v-for="category in filteredCategories" :key="category.id" class="new-appt__group">
              <p class="new-appt__group-name">{{ category.name }}</p>
              <button
                v-for="service in category.services"
                :key="service.id"
                type="button"
                class="new-appt__service"
                :class="{ 'new-appt__service--on': isSelected(service) }"
                :aria-pressed="isSelected(service)"
                @click="toggleService(service)"
              >
                <span class="new-appt__check" aria-hidden="true">{{ isSelected(service) ? '✓' : '+' }}</span>
                <span class="new-appt__service-name">{{ service.name }}</span>
                <span class="new-appt__service-meta">{{ formatDuration(service.durationMinutes) }} · {{ formatPrice(service.price) }}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <label class="admin-field">
        Data
        <AdminDatePicker v-model="date" :min="todayKey" />
      </label>

      <section class="new-appt__block">
        <label class="admin-field new-appt__time">
          Horário
          <input v-model="time" type="time" step="300" required />
        </label>
        <p v-if="isOutsideSlots" class="new-appt__note">Encaixe: fora dos horários livres do site. Pode agendar normalmente.</p>
        <template v-if="selectedServices.length">
          <p v-if="loadingSlots" class="new-appt__hint">Carregando horários livres…</p>
          <template v-else-if="slots.length">
            <p class="new-appt__hint">Horários livres no expediente:</p>
            <div class="new-appt__slot-grid">
              <button
                v-for="slot in slots"
                :key="slot.startAt"
                type="button"
                class="new-appt__slot"
                :class="{ 'new-appt__slot--selected': time === formatSlotTime(slot.startAt) }"
                @click="time = formatSlotTime(slot.startAt)"
              >
                {{ formatSlotTime(slot.startAt) }}
              </button>
            </div>
          </template>
          <p v-else class="new-appt__hint">Sem horários livres no expediente desta data. Digite o horário acima para encaixar.</p>
        </template>
      </section>

      <div class="new-appt__suggest-wrap">
        <label class="admin-field">
          Nome da cliente
          <input
            v-model="customer.name"
            type="text"
            autocomplete="off"
            required
            @input="searchPatients('name')"
            @focus="searchPatients('name')"
            @blur="closeSuggestions"
          />
        </label>
        <ul v-if="suggestFor === 'name' && suggestions.length" class="new-appt__suggestions">
          <li v-for="patient in suggestions" :key="patient.id">
            <button type="button" @mousedown.prevent @click="pickPatient(patient)">
              <span>{{ patient.name }}</span>
              <span class="new-appt__suggest-phone">{{ formatPhone(patient.whatsapp) }}</span>
            </button>
          </li>
        </ul>
      </div>

      <div class="new-appt__suggest-wrap">
        <label class="admin-field">
          WhatsApp (com DDD)
          <input
            v-model="customer.whatsapp"
            type="tel"
            inputmode="numeric"
            autocomplete="off"
            placeholder="71999999999"
            required
            @input="searchPatients('whatsapp')"
            @blur="closeSuggestions"
          />
        </label>
        <ul v-if="suggestFor === 'whatsapp' && suggestions.length" class="new-appt__suggestions">
          <li v-for="patient in suggestions" :key="patient.id">
            <button type="button" @mousedown.prevent @click="pickPatient(patient)">
              <span>{{ patient.name }}</span>
              <span class="new-appt__suggest-phone">{{ formatPhone(patient.whatsapp) }}</span>
            </button>
          </li>
        </ul>
      </div>

      <label class="admin-field">
        E-mail (opcional)
        <input v-model="customer.email" type="email" />
      </label>
      <label class="admin-field">
        Observações (opcional)
        <input v-model="notes" type="text" />
      </label>

      <p v-if="submitError" class="admin-error">{{ submitError }}</p>
      <button type="submit" class="button button--primary" :disabled="submitting || !canSubmit">
        {{ submitting ? 'Agendando…' : 'Confirmar agendamento' }}
      </button>
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
}

.new-appt__empty p {
  color: var(--color-ink-muted);
}

.new-appt__block {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.new-appt__block-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-3);
}

.new-appt__label {
  font-size: 0.85rem;
  font-weight: 600;
}

.new-appt__link {
  border: 0;
  background: none;
  padding: 4px 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-rose-700);
  cursor: pointer;
}

.new-appt__chosen {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.new-appt__chosen li {
  font-size: 0.9rem;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--space-2);
  padding: 8px 6px 8px 12px;
  border-bottom: 1px solid var(--color-border);
}

.new-appt__chosen-name {
  overflow-wrap: anywhere;
}

.new-appt__chosen-meta {
  font-size: 0.8rem;
  color: var(--color-ink-muted);
  white-space: nowrap;
}

.new-appt__remove {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 50%;
  background: none;
  font-size: 1.2rem;
  line-height: 1;
  color: var(--color-ink-muted);
  cursor: pointer;
}

.new-appt__remove:hover {
  background: var(--color-rose-100);
  color: var(--color-ink);
}

.new-appt__chosen .new-appt__total {
  grid-template-columns: 1fr auto;
  padding-right: 12px;
  border-bottom: 0;
  font-weight: 600;
  font-size: 0.85rem;
}

.new-appt__picker {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.new-appt__search {
  font: inherit;
  font-size: 0.95rem;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
}

.new-appt__search:focus-visible {
  border-color: var(--color-rose-700);
  box-shadow: 0 0 0 3px var(--color-rose-100);
  outline: none;
}

.new-appt__service-list {
  max-height: min(46vh, 380px);
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.new-appt__group-name {
  position: sticky;
  top: 0;
  z-index: 1;
  margin: 0;
  padding: 6px 12px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-ink-muted);
  background: var(--color-surface, var(--color-bg));
  border-bottom: 1px solid var(--color-border);
}

.new-appt__service {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  column-gap: var(--space-2);
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-bottom: 1px solid var(--color-border);
  background: none;
  text-align: left;
  cursor: pointer;
}

.new-appt__service:hover {
  background: var(--color-rose-100);
}

.new-appt__check {
  grid-row: span 2;
  align-self: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 0.8rem;
  line-height: 1;
  color: var(--color-ink-muted);
}

.new-appt__service--on .new-appt__check {
  border-color: var(--color-rose-700);
  background: var(--color-rose-700);
  color: #fff;
}

.new-appt__service-name {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.new-appt__service-meta {
  font-size: 0.8rem;
  color: var(--color-ink-muted);
}

.new-appt__time input {
  max-width: 160px;
}

.new-appt__hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-ink-muted);
}

.new-appt__note {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-rose-700);
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

.new-appt__suggest-wrap {
  position: relative;
}

.new-appt__suggestions {
  position: absolute;
  z-index: 5;
  left: 0;
  right: 0;
  top: 100%;
  margin: 4px 0 0;
  padding: 4px 0;
  list-style: none;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: 0 12px 28px rgb(0 0 0 / 0.12);
}

.new-appt__suggestions button {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 2px var(--space-3);
  width: 100%;
  padding: 10px 12px;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
}

.new-appt__suggestions button:hover {
  background: var(--color-rose-100);
}

.new-appt__suggest-phone {
  font-size: 0.85rem;
  color: var(--color-ink-muted);
}

.admin-error {
  color: var(--color-danger);
  font-size: 0.85rem;
}
</style>
