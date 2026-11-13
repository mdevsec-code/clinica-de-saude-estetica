import { API_URL } from '@/services/api';

// Fotos enviadas pelo painel ficam no servidor da API (/site-content/images/…),
// não no site: o endereço completo é montado aqui. As demais (/services,
// /brand, https://) passam direto.
export function assetUrl(url: string | null | undefined) {
  if (!url) return '';
  return url.startsWith('/site-content/') ? `${API_URL}${url}` : url;
}

// Miniatura (240px, WebP) das fotos de serviço que vêm com o site, para onde
// elas aparecem pequenas (listas, cartões). Os originais têm 1200px e
// ~150 KB cada: com 60 serviços na tela, decodificar todos travava a troca
// de aba do painel. Geradas em public/services/catalog/thumbs. Foto enviada
// pelo painel (sem miniatura) usa o original.
const CATALOG = '/services/catalog/';

export function thumbUrl(url: string | null | undefined) {
  if (!url || !url.startsWith(CATALOG) || url.includes('/thumbs/')) return assetUrl(url);
  const file = url.slice(CATALOG.length).replace(/\.(jpe?g|png|webp)$/i, '.webp');
  return `${CATALOG}thumbs/${file}`;
}
