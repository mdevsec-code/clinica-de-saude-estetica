// Remove acentos via decomposicao Unicode (NFD) + faixa de "combining
// diacritical marks" (U+0300-U+036F) -- assim "Harmonizacao" com acento
// vira "harmonizacao" em vez de um slug cheio de %-encoding.
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
