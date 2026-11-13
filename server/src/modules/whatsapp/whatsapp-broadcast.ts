import { formatInTimeZone } from 'date-fns-tz';
import pino from 'pino';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { isWhatsappConnected, onWhatsappContacts, phoneKey, sendWhatsappText, type PhoneContact } from './whatsapp-connection';

// Lista de transmissão (Painel → WhatsApp): uma mensagem para os contatos
// salvos no celular da Noely e/ou as pacientes do sistema.
//
// WhatsApp não oficial bloqueia número que dispara em massa — por isso o
// envio é lento de propósito: 1 mensagem a cada 20–40 s, só das 8h às 20h e
// no máximo 200 por dia (o resto continua no dia seguinte). O progresso fica
// no banco: reiniciar o servidor não reenvia nem perde a fila.

const logger = pino({ level: 'info' }).child({ module: 'whatsapp-broadcast' });

const MIN_GAP_MS = 20_000;
const MAX_GAP_MS = 40_000;
const DAILY_LIMIT = 200;
const START_HOUR = 8;
const END_HOUR = 20;

export type BroadcastSource = 'contacts' | 'patients';

export const DEFAULT_BROADCAST_MESSAGE = `{Saudacao}, {Cliente}! 💖

Aqui é a Noely Cerqueira. Passando para avisar que *mudamos de sistema*: os agendamentos agora são feitos pelo nosso novo site — não é mais pela Agenda Serviço.

📅 Agende por aqui: {LinkAgendamento}

É rapidinho: você escolhe o procedimento, o dia e o horário, e a confirmação chega aqui pelo WhatsApp. Qualquer dúvida, é só responder esta mensagem. ✨`;

// --- Contatos do celular (sincronizados pelo WhatsApp do aparelho) ---------
onWhatsappContacts(async (tenantId: string, contacts: PhoneContact[]) => {
  for (const c of contacts) {
    await prisma.whatsappAddressContact.upsert({
      where: { tenantId_phone: { tenantId, phone: c.phone } },
      create: { tenantId, phone: c.phone, name: c.name },
      update: { name: c.name },
    });
  }
  if (contacts.length) logger.info({ count: contacts.length }, 'Contatos do celular sincronizados');
});

// Quem recebe: sem repetir o mesmo número (DDD + 8 dígitos).
export async function buildAudience(tenantId: string, sources: BroadcastSource[]) {
  const list: { phone: string; name: string }[] = [];
  if (sources.includes('contacts')) {
    const contacts = await prisma.whatsappAddressContact.findMany({ where: { tenantId }, select: { phone: true, name: true } });
    list.push(...contacts);
  }
  if (sources.includes('patients')) {
    const customers = await prisma.customer.findMany({ where: { tenantId }, select: { whatsapp: true, name: true } });
    list.push(...customers.map((c) => ({ phone: c.whatsapp.replace(/\D/g, ''), name: c.name })));
  }
  const seen = new Set<string>();
  return list.filter((r) => {
    if (r.phone.replace(/\D/g, '').length < 10) return false;
    const key = phoneKey(r.phone);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function audienceCounts(tenantId: string) {
  const [contacts, patients, both] = await Promise.all([
    buildAudience(tenantId, ['contacts']),
    buildAudience(tenantId, ['patients']),
    buildAudience(tenantId, ['contacts', 'patients']),
  ]);
  return { contacts: contacts.length, patients: patients.length, both: both.length };
}

export async function createBroadcast(tenantId: string, message: string, sources: BroadcastSource[], createdByName: string) {
  const running = await prisma.broadcast.findFirst({ where: { tenantId, status: 'RUNNING' } });
  if (running) throw new Error('Já existe uma transmissão em andamento. Cancele ou espere terminar.');
  const audience = await buildAudience(tenantId, sources);
  if (!audience.length) throw new Error('Nenhum contato para enviar. Sincronize os contatos do celular ou escolha as pacientes.');
  return prisma.broadcast.create({
    data: {
      tenantId,
      message,
      total: audience.length,
      createdByName,
      recipients: { create: audience.map((r) => ({ phone: r.phone, name: r.name })) },
    },
  });
}

export function listBroadcasts(tenantId: string) {
  return prisma.broadcast.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, status: true, total: true, sent: true, failed: true, createdByName: true, createdAt: true, finishedAt: true, message: true },
  });
}

export async function cancelBroadcast(tenantId: string, id: string) {
  await prisma.broadcast.updateMany({ where: { id, tenantId, status: 'RUNNING' }, data: { status: 'CANCELLED', finishedAt: new Date() } });
}

function firstName(name: string) {
  const first = name.trim().split(/\s+/)[0] ?? '';
  if (!/\p{L}/u.test(first)) return '';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export function renderBroadcast(message: string, name: string, timezone: string) {
  const hour = Number(formatInTimeZone(new Date(), timezone, 'H'));
  const saudacao = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  return message
    .replace(/\{Saudacao\}/g, saudacao)
    .replace(/\{Cliente\}/g, firstName(name))
    .replace(/\{LinkAgendamento\}/g, `${env.WEB_ORIGIN}/agendar`)
    .replace(/,(\s*[!.?])/g, '$1') // "Bom dia, !" quando não há nome
    .replace(/ +([,!.?])/g, '$1');
}

// --- Envio em segundo plano -------------------------------------------------
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendNext(): Promise<number> {
  const broadcast = await prisma.broadcast.findFirst({ where: { status: 'RUNNING' }, orderBy: { createdAt: 'asc' }, include: { tenant: { select: { timezone: true } } } });
  if (!broadcast) return 30_000;
  const { tenantId } = broadcast;
  const tz = broadcast.tenant.timezone;
  const hour = Number(formatInTimeZone(new Date(), tz, 'H'));
  if (hour < START_HOUR || hour >= END_HOUR) return 10 * 60_000;
  if (!isWhatsappConnected(tenantId)) return 60_000;

  const todayStart = new Date(`${formatInTimeZone(new Date(), tz, 'yyyy-MM-dd')}T00:00:00${formatInTimeZone(new Date(), tz, 'xxx')}`);
  const sentToday = await prisma.broadcastRecipient.count({ where: { broadcast: { tenantId }, sentAt: { gte: todayStart } } });
  if (sentToday >= DAILY_LIMIT) return 10 * 60_000;

  const next = await prisma.broadcastRecipient.findFirst({ where: { broadcastId: broadcast.id, status: 'PENDING' }, orderBy: { id: 'asc' } });
  if (!next) {
    await prisma.broadcast.update({ where: { id: broadcast.id }, data: { status: 'DONE', finishedAt: new Date() } });
    logger.info({ broadcastId: broadcast.id }, 'Transmissão concluída');
    return 5_000;
  }
  try {
    await sendWhatsappText(tenantId, next.phone, renderBroadcast(broadcast.message, next.name, tz));
    await prisma.$transaction([
      prisma.broadcastRecipient.update({ where: { id: next.id }, data: { status: 'SENT', sentAt: new Date() } }),
      prisma.broadcast.update({ where: { id: broadcast.id }, data: { sent: { increment: 1 } } }),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Caiu a conexão no meio: tenta esta mesma pessoa de novo depois.
    if (!isWhatsappConnected(tenantId)) return 60_000;
    await prisma.$transaction([
      prisma.broadcastRecipient.update({ where: { id: next.id }, data: { status: 'FAILED', error: message.slice(0, 200), sentAt: new Date() } }),
      prisma.broadcast.update({ where: { id: broadcast.id }, data: { failed: { increment: 1 } } }),
    ]);
  }
  return MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS);
}

export function startBroadcastWorker() {
  const loop = async () => {
    let wait = 30_000;
    try {
      wait = await sendNext();
    } catch (err) {
      logger.error({ err }, 'Falha na lista de transmissão');
    }
    await sleep(wait);
    loop();
  };
  setTimeout(loop, 30_000);
}
