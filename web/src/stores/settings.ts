import { defineStore } from 'pinia';
import type { PublicSettings } from '@/types';
import { fetchPublicSettings } from '@/services/settings.service';
import { FALLBACK_SETTINGS } from '@/data/fallback';

interface SettingsState {
  data: PublicSettings | null;
  loading: boolean;
  error: string | null;
}

// Carregado uma vez e compartilhado (header, footer, botão de WhatsApp, página
// de contato) — evita repetir a mesma chamada de API em vários componentes.
export const useSettingsStore = defineStore('settings', {
  state: (): SettingsState => ({ data: null, loading: false, error: null }),
  actions: {
    async load() {
      if (this.data || this.loading) return;
      this.loading = true;
      this.error = null;
      try {
        this.data = await fetchPublicSettings();
      } catch {
        // Mantém o site funcional (WhatsApp, endereço, horário) mesmo com a
        // API fora do ar, usando os dados reais já conhecidos como fallback.
        this.data = FALLBACK_SETTINGS;
        this.error = 'Mostrando informações de contato salvas localmente — não foi possível confirmar com o servidor agora.';
      } finally {
        this.loading = false;
      }
    },
  },
});
