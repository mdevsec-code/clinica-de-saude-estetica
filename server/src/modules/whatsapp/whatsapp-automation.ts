import type { MessageTemplateKey } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import pino from 'pino';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { listMessageTemplates } from '../messages/messages.service';
import {
  isWhatsappConnected,
  onIncomingWhatsappMessage,
  phoneKey,
  replyWhatsapp,
  sendWhatsappText,
  type IncomingWhatsappMessage,
} from './whatsapp-connection';

// Fluxo automático do WhatsApp da clínica:
//  1. A pessoa escreve para a clínica → Saudação (no máximo 1 a cada 14 dias
//     por contato, a mesma regra da saudação do WhatsApp Business).
//  2. Agenda (site ou painel) → Confirmação, pedindo "SIM".
//  3. Responde "sim" → agendamento marcado como confirmado pela paciente +
//     mensagem de agradecimento.
//  4. Lembrete 1 dia antes e lembrete 2 horas antes.
// Os textos vêm dos modelos editáveis do painel (modules/messages); cada
// envio é marcado no banco para nunca repetir. Nada aqui varre o histórico:
// agendamentos de antes desta função existir não recebem nada retroativo.

const logger = pino({ level: 'info' }).child({ module: 'whatsapp-automation' });

// Link de localização usado quando a clínica não cadastrou um em
// TenantSettings.addressMapUrl — o mesmo que ela já mandava às pacientes.
const DEFAULT_LOCATION_URL = 'https://share.google/4RGBwnV5EyzVVzmcP';
const PROFESSIONAL_NAME = 'Noely Cerqueira';
const WELCOME_COOLDOWN_DAYS = 14;

// Lembrete de 1 dia antes: nada de mensagem de madrugada — se as 24h
// caírem fora desta janela (no horário da clínica), sai no começo dela.
const QUIET_FROM_HOUR = 21;
const QUIET_UNTIL_HOUR = 7;

const HOUR = 60 * 60_000;

// "sim", "Sim!", "SIM, confirmo", "confirmado", "ok", "pode confirmar"...
// Acentos e pontuação ignorados; só o começo da resposta importa.
const YES_RE = /^(sim|s|ss|simm+|confirm[oa]|confirmad[oa]|ok|okay|pode confirmar|claro)\b/;

function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim();
}

function greeting(timezone: string, at = new Date()) {
  const hour = Number(formatInTimeZone(at, timezone, 'H'));
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function firstName(fullName: string | null | undefined) {
  const first = (fullName ?? '').trim().split(/\s+/)[0] ?? '';
  // Nome de perfil do WhatsApp às vezes é só emoji ou apelido com símbolos.
  if (!/\p{L}/u.test(first)) return '';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function formatPrice(cents: number | null) {
  if (cents == null) return 'Valor mediante avaliação';
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Troca cada {Variavel} pelo valor; variáveis desconhecidas ficam como
// estão (melhor a clínica ver "{Algo}" na mensagem do que sumir texto).
// Quando o nome não é conhecido (Saudação para quem nunca agendou e não tem
// nome no perfil), "{Saudacao}, {Cliente}, seja..." vira "Bom dia, seja...",
// sem vírgula sobrando.
export function renderTemplate(body: string, vars: Record<string, string>) {
  return body
    .replace(/\{(\w+)\}/g, (match, name: string) => vars[name] ?? match)
    .replace(/,(\s*,)+/g, ',')
    .replace(/ +([,!.?])/g, '$1')
    .replace(/,([!.?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ');
}

interface AppointmentForMessage {
  startAt: Date;
  customer: { name: string };
  service: { name: string; priceCents: number | null };
}

async function buildVariables(tenantId: string, timezone: string, appt?: AppointmentForMessage, name?: string | null) {
  const settings = await prisma.tenantSettings.findUnique({ where: { tenantId }, select: { addressMapUrl: true } });
  return {
    Saudacao: greeting(timezone),
    Cliente: firstName(appt?.customer.name ?? name),
    Data: appt ? formatInTimeZone(appt.startAt, timezone, 'dd/MM/yyyy') : '',
    Horario: appt ? formatInTimeZone(appt.startAt, timezone, 'HH:mm') : '',
    Servico: appt?.service.name ?? '',
    Valor: appt ? formatPrice(appt.service.priceCents) : '',
    Profissional: PROFESSIONAL_NAME,
    LinkAgendamento: `${env.WEB_ORIGIN}/agendar`,
    Localizacao: settings?.addressMapUrl ?? DEFAULT_LOCATION_URL,
  };
}

async function enabledTemplate(tenantId: string, key: MessageTemplateKey) {
  const template = (await listMessageTemplates(tenantId)).find((t) => t.key === key);
  return template?.enabled ? template.body : null;
}

async function tenantTimezone(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } });
  return tenant?.timezone ?? 'America/Bahia';
}

// Quem recebeu qualquer mensagem automática conta como "já saudado": a
// paciente que agendou e depois escreve com uma dúvida não recebe a
// Saudação de boas-vindas no meio da conversa.
async function markContactGreeted(tenantId: string, phone: string) {
  const key = phoneKey(phone);
  await prisma.whatsappContact.upsert({
    where: { tenantId_phoneKey: { tenantId, phoneKey: key } },
    create: { tenantId, phoneKey: key, lastWelcomeAt: new Date() },
    update: { lastWelcomeAt: new Date() },
  });
}

// --- 2. Confirmação ao agendar ------------------------------------------
// Chamado logo depois de o agendamento ser gravado (site ou painel — a mesma
// rota), em segundo plano: não atrasa a resposta para quem agendou.
export async function onAppointmentCreated(tenantId: string, appointmentId: string) {
  if (!isWhatsappConnected(tenantId)) return;
  const template = await enabledTemplate(tenantId, 'CONFIRMATION');
  if (!template) return;

  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId },
    include: {
      tenant: { select: { timezone: true } },
      customer: { select: { name: true, whatsapp: true } },
      service: { select: { name: true, priceCents: true } },
    },
  });
  if (!appt || appt.confirmationSentAt) return;

  const vars = await buildVariables(tenantId, appt.tenant.timezone, appt);
  await sendWhatsappText(tenantId, appt.customer.whatsapp, renderTemplate(template, vars));
  await prisma.appointment.update({ where: { id: appt.id }, data: { confirmationSentAt: new Date() } });
  await markContactGreeted(tenantId, appt.customer.whatsapp);
}

// --- 1 e 3. Mensagens recebidas ------------------------------------------
async function handleIncoming(message: IncomingWhatsappMessage) {
  const { tenantId, phoneDigits, replyJid } = message;
  const key = phoneKey(phoneDigits);
  const timezone = await tenantTimezone(tenantId);

  // 3. "SIM" para uma confirmação pendente: o agendamento futuro mais
  // próximo desse número que recebeu a confirmação e ainda não foi
  // confirmado pela paciente.
  if (YES_RE.test(normalize(message.text))) {
    const pending = await prisma.appointment.findMany({
      where: { tenantId, status: 'CONFIRMED', confirmationSentAt: { not: null }, clientConfirmedAt: null, startAt: { gt: new Date() } },
      include: { customer: { select: { name: true, whatsapp: true } }, service: { select: { name: true, priceCents: true } } },
      orderBy: { startAt: 'asc' },
    });
    const appt = pending.find((a) => phoneKey(a.customer.whatsapp) === key);
    if (appt) {
      await prisma.appointment.update({ where: { id: appt.id }, data: { clientConfirmedAt: new Date() } });
      logger.info({ appointmentId: appt.id }, 'Paciente confirmou pelo WhatsApp');
      const thanks = await enabledTemplate(tenantId, 'CONFIRMATION_THANKS');
      if (thanks) await replyWhatsapp(tenantId, replyJid, renderTemplate(thanks, await buildVariables(tenantId, timezone, appt)));
      return;
    }
  }

  // 1. Saudação: primeira mensagem do contato, ou a primeira depois de 14
  // dias sem nenhuma mensagem automática para ele.
  const template = await enabledTemplate(tenantId, 'WELCOME');
  if (!template) return;
  const contact = await prisma.whatsappContact.findUnique({ where: { tenantId_phoneKey: { tenantId, phoneKey: key } } });
  if (contact && Date.now() - contact.lastWelcomeAt.getTime() < WELCOME_COOLDOWN_DAYS * 24 * HOUR) return;

  // Nome: o cadastro da paciente, se ela já for paciente; senão o nome do
  // perfil do WhatsApp.
  const customers = await prisma.customer.findMany({ where: { tenantId }, select: { name: true, whatsapp: true } });
  const known = customers.find((c) => phoneKey(c.whatsapp) === key);
  const vars = await buildVariables(tenantId, timezone, undefined, known?.name ?? message.pushName);

  await markContactGreeted(tenantId, phoneDigits);
  await replyWhatsapp(tenantId, replyJid, renderTemplate(template, vars));
}

onIncomingWhatsappMessage(handleIncoming);

// --- 4. Lembretes ------------------------------------------------------
async function sendReminders(tenantId: string, timezone: string) {
  const now = new Date();
  const hour = Number(formatInTimeZone(now, timezone, 'H'));
  const quiet = hour >= QUIET_FROM_HOUR || hour < QUIET_UNTIL_HOUR;
  const include = { customer: { select: { name: true, whatsapp: true } }, service: { select: { name: true, priceCents: true } } };

  type Job = { field: 'reminderDayBeforeSentAt' | 'reminder2hSentAt'; template: string | null; appts: Awaited<ReturnType<typeof findDue>> };
  async function findDue(field: Job['field'], from: Date, to: Date, leadMs: number) {
    const candidates = await prisma.appointment.findMany({
      where: { tenantId, status: 'CONFIRMED', [field]: null, startAt: { gte: from, lte: to } },
      include,
      orderBy: { startAt: 'asc' },
    });
    // Quem agendou já dentro da antecedência do lembrete (ex.: marcou hoje
    // para amanhã de manhã) acabou de receber a confirmação — o lembrete
    // seria repetitivo.
    return candidates.filter((a) => a.createdAt.getTime() <= a.startAt.getTime() - leadMs);
  }

  const jobs: Job[] = [];
  // 1 dia antes: entre 24h e 3h antes do horário (a folga cobre a janela de
  // silêncio da madrugada e reinícios do servidor), fora da madrugada.
  if (!quiet) {
    jobs.push({
      field: 'reminderDayBeforeSentAt',
      template: await enabledTemplate(tenantId, 'REMINDER_DAY_BEFORE'),
      appts: await findDue('reminderDayBeforeSentAt', new Date(now.getTime() + 3 * HOUR), new Date(now.getTime() + 24 * HOUR), 24 * HOUR),
    });
  }
  // 2 horas antes: entre 2h e 15min antes.
  jobs.push({
    field: 'reminder2hSentAt',
    template: await enabledTemplate(tenantId, 'REMINDER_2H'),
    appts: await findDue('reminder2hSentAt', new Date(now.getTime() + 15 * 60_000), new Date(now.getTime() + 2 * HOUR), 2 * HOUR),
  });

  for (const job of jobs) {
    if (!job.template) continue;
    for (const appt of job.appts) {
      try {
        await sendWhatsappText(tenantId, appt.customer.whatsapp, renderTemplate(job.template, await buildVariables(tenantId, timezone, appt)));
        await prisma.appointment.update({ where: { id: appt.id }, data: { [job.field]: new Date() } });
        await markContactGreeted(tenantId, appt.customer.whatsapp);
      } catch (err) {
        logger.error({ err, appointmentId: appt.id, reminder: job.field }, 'Falha ao enviar lembrete');
        // Número sem WhatsApp não vai passar a ter na próxima rodada: marca
        // como tratado para não tentar de novo a cada 5 minutos.
        if (err instanceof Error && err.message.includes('não tem WhatsApp')) {
          await prisma.appointment.update({ where: { id: appt.id }, data: { [job.field]: new Date() } });
        }
        // WhatsApp caiu no meio da rodada: para aqui; a próxima retoma.
        if (!isWhatsappConnected(tenantId)) return;
      }
    }
  }
}

let sweeping = false;

// Varredura de lembretes a cada 5 minutos. Uma rodada por vez (se a
// anterior ainda estiver enviando — a fila espaça as mensagens —, esta é
// pulada).
export function startReminderScheduler(intervalMs = 5 * 60_000) {
  const tick = async () => {
    if (sweeping) return;
    sweeping = true;
    try {
      const tenants = await prisma.tenant.findMany({ select: { id: true, timezone: true } });
      for (const tenant of tenants) {
        if (isWhatsappConnected(tenant.id)) await sendReminders(tenant.id, tenant.timezone);
      }
    } catch (err) {
      logger.error({ err }, 'Falha na varredura de lembretes');
    } finally {
      sweeping = false;
    }
  };
  setTimeout(tick, 60_000);
  return setInterval(tick, intervalMs);
}
