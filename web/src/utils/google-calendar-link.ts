// Link "Adicionar ao Google Agenda" para a paciente salvar o horário na
// própria agenda depois de agendar. Não usa API nem login: é o formulário de
// criação de evento do Google já preenchido (action=TEMPLATE) — a paciente
// confere e clica em salvar na conta dela.
interface GoogleCalendarLinkInput {
  title: string;
  startAt: string; // ISO 8601
  endAt: string;
  details?: string;
  location?: string | null;
}

// Formato exigido em "dates": UTC compacto, ex. 20261027T130000Z.
function toGoogleDate(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function buildGoogleCalendarLink({ title, startAt, endAt, details, location }: GoogleCalendarLinkInput) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${toGoogleDate(startAt)}/${toGoogleDate(endAt)}`,
    ctz: 'America/Bahia',
  });
  if (details) params.set('details', details);
  if (location) params.set('location', location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
