import { defineStore } from 'pinia';
import type { CustomerInput, Service, Slot } from '@/types';

export type BookingStep = 'service' | 'date' | 'time' | 'details' | 'confirmation';

interface BookingState {
  selectedService: Service | null;
  selectedDate: string | null; // yyyy-MM-dd
  selectedSlot: Slot | null;
  customer: CustomerInput;
  notes: string;
  confirmedAppointmentId: string | null;
}

// Estado do fluxo de agendamento inteiro concentrado aqui — nenhuma view
// guarda a "fonte de verdade" da seleção, evitando perder o progresso ao
// navegar entre as etapas (item 65 do escopo: Pinia só para estado compartilhado).
export const useBookingStore = defineStore('booking', {
  state: (): BookingState => ({
    selectedService: null,
    selectedDate: null,
    selectedSlot: null,
    customer: { name: '', whatsapp: '' },
    notes: '',
    confirmedAppointmentId: null,
  }),
  getters: {
    currentStep(state): BookingStep {
      if (state.confirmedAppointmentId) return 'confirmation';
      if (!state.selectedService) return 'service';
      if (!state.selectedDate) return 'date';
      if (!state.selectedSlot) return 'time';
      return 'details';
    },
  },
  actions: {
    selectService(service: Service) {
      this.selectedService = service;
      this.selectedDate = null;
      this.selectedSlot = null;
    },
    selectDate(date: string) {
      this.selectedDate = date;
      this.selectedSlot = null;
    },
    selectSlot(slot: Slot) {
      this.selectedSlot = slot;
    },
    goBackTo(step: 'service' | 'date' | 'time') {
      if (step === 'service') {
        this.selectedService = null;
        this.selectedDate = null;
        this.selectedSlot = null;
      } else if (step === 'date') {
        this.selectedDate = null;
        this.selectedSlot = null;
      } else if (step === 'time') {
        this.selectedSlot = null;
      }
    },
    reset() {
      this.selectedService = null;
      this.selectedDate = null;
      this.selectedSlot = null;
      this.customer = { name: '', whatsapp: '' };
      this.notes = '';
      this.confirmedAppointmentId = null;
    },
  },
});
