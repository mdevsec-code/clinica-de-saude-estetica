import { useSettingsStore } from '@/stores/settings';
import { useSiteContentStore } from '@/stores/siteContent';
import { markAppIntroReady } from '@/composables/useAppIntro';

// Pré-visualização do Painel → Site: o painel abre o site num iframe com
// ?preview=1 e manda por postMessage os textos/fotos ainda não salvos
// ("Depois") ou null ("Antes", o que está publicado). Só aceita mensagens da
// própria origem (o painel), nunca de outro site.
export const isSitePreview = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('preview');

type PreviewMessage =
  | { type: 'site-preview'; content: Record<string, string> | null; contact: Record<string, string | null> | null }
  | { type: 'site-preview-scroll'; selector: string };

export function installSitePreview() {
  if (!isSitePreview) return;
  markAppIntroReady(); // sem cortina de abertura: o topo entra direto
  const site = useSiteContentStore();
  const settings = useSettingsStore();
  let publishedContact: Record<string, unknown> | null = null;

  window.addEventListener('message', (event: MessageEvent<PreviewMessage>) => {
    if (event.origin !== window.location.origin || !event.data || typeof event.data !== 'object') return;
    const msg = event.data;
    if (msg.type === 'site-preview') {
      site.preview = msg.content;
      if (settings.data) {
        publishedContact ??= { ...settings.data };
        settings.data = { ...settings.data, ...(msg.contact ?? publishedContact) };
      }
    } else if (msg.type === 'site-preview-scroll') {
      document.querySelector(msg.selector)?.scrollIntoView({ block: 'start' });
    }
  });
  // Avisa o painel que já pode mandar o rascunho (depois de ter o contato
  // publicado, para o "Antes" do contato ter com o que comparar).
  settings.load().finally(() => window.parent.postMessage({ type: 'site-preview-ready' }, window.location.origin));
}
