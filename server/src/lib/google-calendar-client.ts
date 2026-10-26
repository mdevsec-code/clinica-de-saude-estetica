import { GoogleAuth } from 'google-auth-library';
import { env } from '../config/env';

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(env.GOOGLE_CALENDAR_ID && env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE);
}

// Cliente fino para a Google Calendar API v3, autenticado por conta de
// serviço (um "usuário robô" do Google Cloud). Nada de OAuth de usuário de
// propósito: a Noely só compartilha a agenda dela com o e-mail da conta de
// serviço, sem tela de login/consentimento nem refresh token para guardar.
// Escopo calendar.events: ler e escrever eventos, sem acesso a configurações
// da agenda nem a outras agendas que não foram compartilhadas.
const auth = new GoogleAuth({
  keyFile: env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
  scopes: ['https://www.googleapis.com/auth/calendar.events'],
});

const BASE_URL = 'https://www.googleapis.com/calendar/v3';

export interface GoogleEventTime {
  dateTime?: string;
  date?: string; // evento de dia inteiro: "YYYY-MM-DD", fim exclusivo
  timeZone?: string;
}

export interface GoogleEvent {
  id: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  summary?: string;
  start: GoogleEventTime;
  end: GoogleEventTime;
  transparency?: 'opaque' | 'transparent';
  eventType?: string;
  attendees?: { self?: boolean; responseStatus?: string }[];
  extendedProperties?: { private?: Record<string, string> };
}

export interface GoogleEventInput {
  summary: string;
  description?: string;
  location?: string;
  start: GoogleEventTime;
  end: GoogleEventTime;
  extendedProperties?: { private?: Record<string, string> };
}

function calendarPath() {
  if (!isGoogleCalendarConfigured()) {
    throw new Error(
      'Google Agenda não configurado — defina GOOGLE_CALENDAR_ID e GOOGLE_SERVICE_ACCOUNT_KEY_FILE no .env do servidor.',
    );
  }
  return `${BASE_URL}/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID!)}/events`;
}

function httpStatusOf(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status;
}

export async function insertGoogleEvent(event: GoogleEventInput): Promise<string> {
  const client = await auth.getClient();
  const res = await client.request<GoogleEvent>({ url: calendarPath(), method: 'POST', data: event });
  return res.data.id;
}

// Devolve false quando o evento não existe mais no Google (apagado à mão
// pela Noely) — quem chama decide recriar em vez de tratar como erro.
export async function updateGoogleEvent(eventId: string, event: GoogleEventInput): Promise<boolean> {
  const client = await auth.getClient();
  try {
    await client.request({ url: `${calendarPath()}/${encodeURIComponent(eventId)}`, method: 'PUT', data: event });
    return true;
  } catch (err) {
    const status = httpStatusOf(err);
    if (status === 404 || status === 410) return false;
    throw err;
  }
}

// 404/410 = já não existe (apagado à mão no Google): o resultado desejado
// já foi alcançado, não é erro.
export async function deleteGoogleEvent(eventId: string): Promise<void> {
  const client = await auth.getClient();
  try {
    await client.request({ url: `${calendarPath()}/${encodeURIComponent(eventId)}`, method: 'DELETE' });
  } catch (err) {
    const status = httpStatusOf(err);
    if (status === 404 || status === 410) return;
    throw err;
  }
}

// singleEvents=true expande eventos recorrentes ("toda terça 14h") em
// ocorrências individuais, cada uma com seu próprio horário — é o que o
// cálculo de disponibilidade precisa.
export async function listGoogleEvents(timeMin: Date, timeMax: Date): Promise<GoogleEvent[]> {
  const client = await auth.getClient();
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;
  do {
    const res = await client.request<{ items?: GoogleEvent[]; nextPageToken?: string }>({
      url: calendarPath(),
      method: 'GET',
      params: {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        showDeleted: false,
        maxResults: 2500,
        pageToken,
      },
    });
    events.push(...(res.data.items ?? []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return events;
}
