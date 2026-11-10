import { defineStore } from 'pinia';
import type { CustomerInput, Service, Slot } from '@/types';

export type BookingStep = 'service' | 'date' | 'time' | 'details' | 'confirmation';

interface BookingState {
  // Um ou mais serviços na mesma visita, na ordem em que foram escolhidos.
  selectedServices: Service[];
  // Escolha de serviços concluída ("Continuar"): sem isso, tocar no primeiro
  // serviço já pularia para a data, sem chance de escolher outro.
  servicesConfirmed: boolean;
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
    selectedServices: [],
    servicesConfirmed: false,
    selectedDate: null,
    selectedSlot: null,
    customer: { name: '', whatsapp: '' },
    notes: '',
    confirmedAppointmentId: null,
  }),
  getters: {
    selectedIds(state): string[] {
      return state.selectedServices.map((s) => s.id);
    },
    // A visita inteira como um "serviço" para exibir: nomes juntos, duração
    // somada (é o que o servidor reserva) e valor somado — ou "Consulte" se
    // algum serviço não tiver preço fixo.
    visit(state): { name: string; durationMinutes: number; price: number | null } | null {
      if (!state.selectedServices.length) return null;
      const prices = state.selectedServices.map((s) => s.price);
      return {
        name: state.selectedServices.map((s) => s.name).join(' + '),
        durationMinutes: state.selectedServices.reduce((sum, s) => sum + s.durationMinutes, 0),
        price: prices.includes(null) ? null : prices.reduce<number>((sum, p) => sum + (p ?? 0), 0),
      };
    },
    currentStep(state): BookingStep {
      if (state.confirmedAppointmentId) return 'confirmation';
      if (!state.selectedServices.length || !state.servicesConfirmed) return 'service';
      if (!state.selectedDate) return 'date';
      if (!state.selectedSlot) return 'time';
      return 'details';
    },
  },
  actions: {
    toggleService(service: Service) {
      const has = this.selectedServices.some((s) => s.id === service.id);
      this.selectedServices = has
        ? this.selectedServices.filter((s) => s.id !== service.id)
        : [...this.selectedServices, service];
      this.servicesConfirmed = false;
      this.selectedDate = null;
      this.selectedSlot = null;
    },
    confirmServices() {
      this.servicesConfirmed = this.selectedServices.length > 0;
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
        // Mantém os serviços marcados: voltar é para acrescentar ou trocar.
        this.servicesConfirmed = false;
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
      this.selectedServices = [];
      this.servicesConfirmed = false;
      this.selectedDate = null;
      this.selectedSlot = null;
      this.customer = { name: '', whatsapp: '' };
      this.notes = '';
      this.confirmedAppointmentId = null;
    },
  },
});
