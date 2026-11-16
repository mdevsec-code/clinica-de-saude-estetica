import { defineStore } from 'pinia';
import { apiRequest } from '@/services/api';
import { SITE_DEFAULTS } from '@/data/site-content';

// Textos/fotos editados no painel (Painel → Site). Enquanto carrega (ou se a
// API falhar) o site mostra os textos padrão — nunca fica em branco.
export const useSiteContentStore = defineStore('siteContent', {
  // preview: rascunho vindo do Painel → Site (só na pré-visualização, ver utils/sitePreview).
  state: () => ({ saved: {} as Record<string, string>, loaded: false, preview: null as Record<string, string> | null }),
  actions: {
    async load(force = false) {
      if (this.loaded && !force) return;
      try {
        const { content } = await apiRequest<{ content: Record<string, string> }>('/site-content');
        this.saved = content;
      } catch {
        // fica com os padrões
      }
      this.loaded = true;
    },
  },
  getters: {
    get: (state) => (key: string) => state.preview?.[key] ?? state.saved[key] ?? SITE_DEFAULTS[key] ?? '',
  },
});
