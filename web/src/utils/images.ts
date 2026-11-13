// Miniatura (240px, WebP) das fotos dos serviços para onde elas aparecem
// pequenas (listas, cartões). Os originais têm 1200px e ~150 KB cada: com 60
// serviços na tela, decodificar todos travava a troca de aba do painel.
// Geradas em public/services/catalog/thumbs. Foto enviada depois (sem
// miniatura) continua usando o original.
const CATALOG = '/services/catalog/';

export function thumbUrl(url: string | null | undefined) {
  if (!url || !url.startsWith(CATALOG) || url.includes('/thumbs/')) return url ?? '';
  const file = url.slice(CATALOG.length).replace(/\.(jpe?g|png|webp)$/i, '.webp');
  return `${CATALOG}thumbs/${file}`;
}
