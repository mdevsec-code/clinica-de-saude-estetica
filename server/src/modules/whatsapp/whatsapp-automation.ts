import type { MessageTemplateKey } from '@prisma/client';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { syncAppointmentToGoogle } from '../google-calendar/google-calendar.service';
import pino from 'pino';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { listMessageTemplates } from '../messages/messages.service';
import {
  isWhatsappConnected,
  onIncomingWhatsappMessage,
  onOutgoingWhatsappMessage,
  phoneKey,
  replyWhatsapp,
  sendWhatsappText,
  type IncomingWhatsappMessage,
} from './whatsapp-connection';

// Fluxo automático do WhatsApp da clínica:
//  1. A pessoa escreve para a clínica → Saudação, se a conversa estava
//     parada há 20 minutos ou mais (nenhuma mensagem da pessoa, da Noely
//     pelo celular nem automática). Conversa em andamento não recebe.
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
// Era 14 dias (a regra da saudação do WhatsApp Business); a clínica pediu
// que quem volta a escrever receba o link de novo — 20 minutos de conversa
// parada separam um papo em andamento de uma conversa nova.
const WELCOME_SILENCE_MINUTES = 20;

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

// Qualquer mensagem automática conta como conversa ativa: a paciente que
// acabou de receber a confirmação e responde com uma dúvida não recebe a
// Saudação de boas-vindas no meio da conversa.
async function markContactGreeted(tenantId: string, phone: string) {
  const key = phoneKey(phone);
  const now = new Date();
  await prisma.whatsappContact.upsert({
    where: { tenantId_phoneKey: { tenantId, phoneKey: key } },
    create: { tenantId, phoneKey: key, lastWelcomeAt: now, lastActivityAt: now },
    update: { lastWelcomeAt: now, lastActivityAt: now },
  });
}

// Mensagem da pessoa ou da Noely pelo celular: a conversa está ativa.
async function touchConversation(tenantId: string, phone: string) {
  const key = phoneKey(phone);
  const now = new Date();
  await prisma.whatsappContact.upsert({
    where: { tenantId_phoneKey: { tenantId, phoneKey: key } },
    create: { tenantId, phoneKey: key, lastActivityAt: now },
    update: { lastActivityAt: now },
  });
}

const messageInclude = {
  customer: { select: { name: true, whatsapp: true } },
  service: { select: { name: true, priceCents: true } },
} as const;

type VisitAppointment = AppointmentForMessage & { id: string; customerId: string; endAt: Date };

// Uma visita pode ter vários serviços em sequência (agendamento do painel
// com mais de um serviço vira um atendimento por serviço): a paciente
// recebe UMA mensagem com todos eles, não uma por serviço.
function asVisit(appts: VisitAppointment[]): AppointmentForMessage {
  const prices = appts.map((a) => a.service.priceCents);
  return {
    startAt: appts[0].startAt,
    customer: appts[0].customer,
    service: {
      name: appts.map((a) => a.service.name).join(' + '),
      priceCents: prices.includes(null) ? null : prices.reduce<number>((sum, p) => sum + (p ?? 0), 0),
    },
  };
}

// Atendimentos da mesma paciente colados ao primeiro (até 30 min de
// intervalo entre um e outro) — a mesma visita.
async function visitOf(first: VisitAppointment) {
  const sameDay = await prisma.appointment.findMany({
    where: {
      customerId: first.customerId,
      status: 'CONFIRMED',
      startAt: { gte: first.startAt, lt: new Date(first.startAt.getTime() + 12 * HOUR) },
    },
    include: messageInclude,
    orderBy: { startAt: 'asc' },
  });
  const visit: VisitAppointment[] = [];
  for (const appt of sameDay) {
    const prev = visit[visit.length - 1];
    if (prev && appt.startAt.getTime() - prev.endAt.getTime() > 30 * 60_000) break;
    visit.push(appt);
  }
  return visit.length ? visit : [first];
}

// --- 2. Confirmação ao agendar ------------------------------------------
// Chamado logo depois de o agendamento ser gravado (site ou painel), em
// segundo plano: não atrasa a resposta para quem agendou. Se o WhatsApp
// estiver reconectando nesse instante (acontece algumas vezes por dia) ou o
// envio falhar, a varredura (sendPendingConfirmations) tenta de novo.
const confirmationsInFlight = new Set<string>();

export async function onAppointmentCreated(tenantId: string, appointmentIds: string | string[]) {
  const ids = [appointmentIds].flat().filter((id) => !confirmationsInFlight.has(id));
  if (!ids.length || !isWhatsappConnected(tenantId)) return;
  const template = await enabledTemplate(tenantId, 'CONFIRMATION');
  if (!template) return;

  const appts = await prisma.appointment.findMany({
    where: { id: { in: ids }, tenantId, status: 'CONFIRMED', confirmationSentAt: null, startAt: { gt: new Date() } },
    include: messageInclude,
    orderBy: { startAt: 'asc' },
  });
  if (!appts.length) return;

  appts.forEach((a) => confirmationsInFlight.add(a.id));
  try {
    const vars = await buildVariables(tenantId, await tenantTimezone(tenantId), asVisit(appts));
    await sendWhatsappText(tenantId, appts[0].customer.whatsapp, renderTemplate(template, vars));
    await prisma.appointment.updateMany({ where: { id: { in: appts.map((a) => a.id) } }, data: { confirmationSentAt: new Date() } });
    await markContactGreeted(tenantId, appts[0].customer.whatsapp);
  } finally {
    appts.forEach((a) => confirmationsInFlight.delete(a.id));
  }
}

// Confirmações que não saíram na hora. Só agendamentos das últimas 12h —
// nada retroativo de antes de a automação existir.
async function sendPendingConfirmations(tenantId: string) {
  const now = Date.now();
  const pending = await prisma.appointment.findMany({
    where: {
      tenantId,
      status: 'CONFIRMED',
      confirmationSentAt: null,
      startAt: { gt: new Date(now) },
      createdAt: { gte: new Date(now - 12 * HOUR), lte: new Date(now - 60_000) },
    },
    select: { id: true, customerId: true },
    orderBy: { startAt: 'asc' },
  });
  // Agrupa por paciente: serviços da mesma visita vão numa mensagem só.
  const byCustomer = new Map<string, string[]>();
  for (const appt of pending) byCustomer.set(appt.customerId, [...(byCustomer.get(appt.customerId) ?? []), appt.id]);
  for (const ids of byCustomer.values()) {
    try {
      await onAppointmentCreated(tenantId, ids);
    } catch (err) {
      logger.error({ err, appointmentIds: ids }, 'Falha ao reenviar confirmação');
      if (err instanceof Error && err.message.includes('não tem WhatsApp')) {
        await prisma.appointment.updateMany({ where: { id: { in: ids } }, data: { confirmationSentAt: new Date() } });
      }
      if (!isWhatsappConnected(tenantId)) return;
    }
  }
}

// --- 1 e 3. Mensagens recebidas ------------------------------------------
// Contatos com Saudação sendo enviada agora: quem manda "Oi" e "tudo bem?"
// em seguida (ou a mesma mensagem chega duas vezes, quando o servidor só
// consegue decifrá-la na segunda tentativa) recebe uma Saudação só.
const welcomesInFlight = new Set<string>();
// Saudação que falhou de vez (WhatsApp fora do ar por mais de um minuto):
// a mensagem da pessoa já marcou a conversa como ativa, então sem isto a
// próxima dela também ficaria sem o link. Só em memória — basta para os
// minutos seguintes.
const failedWelcomes = new Set<string>();

// Só o final do número no log: o bastante para achar a conversa no
// celular da clínica, sem gravar o telefone inteiro da pessoa.
function maskPhone(digits: string) {
  return `…${digits.slice(-4)}`;
}

async function handleIncoming(message: IncomingWhatsappMessage) {
  const { tenantId, phoneDigits, replyJid } = message;
  const key = phoneKey(phoneDigits);

  // Quanto tempo a conversa estava parada ANTES desta mensagem — lido
  // primeiro, porque logo abaixo esta própria mensagem já marca a conversa
  // como ativa.
  const contact = await prisma.whatsappContact.findUnique({ where: { tenantId_phoneKey: { tenantId, phoneKey: key } } });
  const lastAt = Math.max(contact?.lastActivityAt?.getTime() ?? 0, contact?.lastWelcomeAt?.getTime() ?? 0);
  const silentMinutes = lastAt ? (Date.now() - lastAt) / 60_000 : Infinity;
  // Reserva a Saudação sem nenhum await entre a decisão e o add: duas
  // mensagens seguidas leem o mesmo "parada há 20 min", mas só a primeira
  // fica com a Saudação.
  const claimsWelcome = (silentMinutes >= WELCOME_SILENCE_MINUTES || failedWelcomes.has(key)) && !welcomesInFlight.has(key);
  if (claimsWelcome) welcomesInFlight.add(key);

  try {
    await touchConversation(tenantId, phoneDigits);
    const timezone = await tenantTimezone(tenantId);

    // 3. "SIM" para uma confirmação pendente: o agendamento futuro mais
    // próximo desse número que recebeu a confirmação e ainda não foi
    // confirmado pela paciente.
    if (YES_RE.test(normalize(message.text))) {
      // SIM para uma proposta de novo horário vem antes da confirmação: quem
      // recebeu a proposta já tinha confirmado o horário antigo.
      const offers = await prisma.appointment.findMany({
        where: {
          tenantId, status: 'CONFIRMED', startAt: { gt: new Date() },
          rescheduleOfferSentAt: { not: null }, rescheduleProposedStartAt: { not: null }, rescheduleAcceptedAt: null,
        },
        include: messageInclude,
        orderBy: { startAt: 'asc' },
      });
      const offer = offers.find((a) => phoneKey(a.customer.whatsapp) === key);
      if (offer) {
        await acceptReschedule(tenantId, timezone, offer, replyJid, phoneDigits);
        return;
      }

      const pending = await prisma.appointment.findMany({
        where: { tenantId, status: 'CONFIRMED', confirmationSentAt: { not: null }, clientConfirmedAt: null, startAt: { gt: new Date() } },
        include: messageInclude,
        orderBy: { startAt: 'asc' },
      });
      const appt = pending.find((a) => phoneKey(a.customer.whatsapp) === key);
      if (appt) {
        const visit = await visitOf(appt);
        await prisma.appointment.updateMany({ where: { id: { in: visit.map((a) => a.id) } }, data: { clientConfirmedAt: new Date() } });
        logger.info({ appointmentId: appt.id }, 'Paciente confirmou pelo WhatsApp');
        const thanks = await enabledTemplate(tenantId, 'CONFIRMATION_THANKS');
        if (thanks) {
          await replyWhatsapp(tenantId, replyJid, renderTemplate(thanks, await buildVariables(tenantId, timezone, asVisit(visit))));
          await markContactGreeted(tenantId, phoneDigits);
        }
        return;
      }
    }

    // 1. Saudação: só quando a conversa estava parada.
    if (!claimsWelcome) {
      if (silentMinutes < WELCOME_SILENCE_MINUTES) {
        logger.info(
          { phone: maskPhone(phoneDigits), minutes: Math.floor(silentMinutes) },
          'Saudação não enviada: conversa em andamento (menos de 20 min desde a última mensagem)',
        );
      }
      return;
    }
    const template = await enabledTemplate(tenantId, 'WELCOME');
    if (!template) {
      logger.info({ phone: maskPhone(phoneDigits) }, 'Saudação desativada no painel — mensagem sem resposta automática');
      return;
    }

    // Nome: o cadastro da paciente, se ela já for paciente; senão o nome do
    // perfil do WhatsApp.
    const customers = await prisma.customer.findMany({ where: { tenantId }, select: { name: true, whatsapp: true } });
    const known = customers.find((c) => phoneKey(c.whatsapp) === key);
    const vars = await buildVariables(tenantId, timezone, undefined, known?.name ?? message.pushName);

    try {
      await sendWelcomeWithRetry(tenantId, replyJid, renderTemplate(template, vars));
    } catch (err) {
      failedWelcomes.add(key);
      throw err;
    }
    failedWelcomes.delete(key);
    await markContactGreeted(tenantId, phoneDigits);
    logger.info({ phone: maskPhone(phoneDigits) }, 'Saudação enviada');
  } finally {
    if (claimsWelcome) welcomesInFlight.delete(key);
  }
}

// A conexão cai e volta algumas vezes por dia, em segundos. Se a Saudação
// pegar esse instante, espera a reconexão e tenta de novo — sem isso, a
// pessoa só receberia a resposta se escrevesse outra vez.
const WELCOME_RETRY_DELAY_MS = 30_000;
const WELCOME_MAX_ATTEMPTS = 3;

async function sendWelcomeWithRetry(tenantId: string, jid: string, text: string) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await replyWhatsapp(tenantId, jid, text);
    } catch (err) {
      if (attempt >= WELCOME_MAX_ATTEMPTS || isWhatsappConnected(tenantId)) throw err;
      logger.warn({ attempt }, 'Saudação não saiu (WhatsApp reconectando) — tentando de novo em 30s');
      await new Promise((resolve) => setTimeout(resolve, WELCOME_RETRY_DELAY_MS));
    }
  }
}

onIncomingWhatsappMessage(handleIncoming);
onOutgoingWhatsappMessage(touchConversation);

// --- 5. Proposta de novo horário ---------------------------------------
// Agendamento futuro que começa antes da abertura do dia — hoje, o sábado
// que passou a abrir às 09:00 com pacientes já marcadas às 08:00. Propõe o
// horário de abertura pelo WhatsApp; com SIM, acceptReschedule remarca.
// Uma proposta por visita, nunca repetida (rescheduleOfferSentAt).
// ignoreQuiet: só para teste (o envio real respeita a janela de silêncio).
export async function sendRescheduleOffers(tenantId: string, timezone: string, { ignoreQuiet = false } = {}) {
  const hour = Number(formatInTimeZone(new Date(), timezone, 'H'));
  if (!ignoreQuiet && (hour >= QUIET_FROM_HOUR || hour < QUIET_UNTIL_HOUR)) return;
  const template = await enabledTemplate(tenantId, 'RESCHEDULE_OFFER');
  if (!template) return;

  const [hours, candidates] = await Promise.all([
    prisma.businessHour.findMany({ where: { tenantId, active: true } }),
    prisma.appointment.findMany({
      // Pelo menos 2h de antecedência: em cima da hora, a clínica resolve
      // direto com a paciente.
      where: { tenantId, status: 'CONFIRMED', rescheduleOfferSentAt: null, startAt: { gt: new Date(Date.now() + 2 * HOUR) } },
      include: messageInclude,
      orderBy: { startAt: 'asc' },
    }),
  ]);

  const handled = new Set<string>();
  for (const appt of candidates) {
    if (handled.has(appt.id)) continue;
    const dateStr = formatInTimeZone(appt.startAt, timezone, 'yyyy-MM-dd');
    const weekday = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
    const opens = hours.filter((h) => h.weekday === weekday).map((h) => h.opensAt).sort()[0];
    if (!opens) continue;
    const opening = fromZonedTime(`${dateStr}T${opens}:00`, timezone);
    if (appt.startAt >= opening) continue;

    const visit = await visitOf(appt);
    const ids = visit.map((a) => a.id);
    ids.forEach((id) => handled.add(id));
    const delta = opening.getTime() - visit[0].startAt.getTime();
    const newEnd = new Date(visit[visit.length - 1].endAt.getTime() + delta);

    const [clash, blocked] = await Promise.all([
      prisma.appointment.findFirst({ where: { tenantId, status: 'CONFIRMED', id: { notIn: ids }, startAt: { lt: newEnd }, endAt: { gt: opening } } }),
      prisma.blockedTime.findFirst({ where: { tenantId, startAt: { lt: newEnd }, endAt: { gt: opening } } }),
    ]);
    if (clash || blocked) {
      // Marca como tratado (sem horário proposto) para não tentar a cada
      // minuto; o painel mostra "remarcar manualmente".
      await prisma.appointment.updateMany({ where: { id: { in: ids } }, data: { rescheduleOfferSentAt: new Date(), rescheduleProposedStartAt: null } });
      logger.warn({ appointmentId: appt.id }, 'Horário de abertura ocupado — proposta de remarcação não enviada; remarcar pelo painel');
      continue;
    }

    try {
      const vars = { ...(await buildVariables(tenantId, timezone, asVisit(visit))), NovoHorario: formatInTimeZone(opening, timezone, 'HH:mm') };
      await sendWhatsappText(tenantId, appt.customer.whatsapp, renderTemplate(template, vars));
      await prisma.appointment.updateMany({ where: { id: { in: ids } }, data: { rescheduleOfferSentAt: new Date(), rescheduleProposedStartAt: opening } });
      await markContactGreeted(tenantId, appt.customer.whatsapp);
      logger.info({ appointmentId: appt.id, proposed: opening.toISOString() }, 'Proposta de novo horário enviada');
    } catch (err) {
      logger.error({ err, appointmentId: appt.id }, 'Falha ao enviar proposta de novo horário');
      if (err instanceof Error && err.message.includes('não tem WhatsApp')) {
        await prisma.appointment.updateMany({ where: { id: { in: ids } }, data: { rescheduleOfferSentAt: new Date(), rescheduleProposedStartAt: null } });
      }
      if (!isWhatsappConnected(tenantId)) return;
    }
  }
}

type OfferAppointment = Awaited<ReturnType<typeof prisma.appointment.findFirstOrThrow<{ include: typeof messageInclude }>>>;

// A paciente respondeu SIM à proposta: move a visita inteira (todos os
// serviços, mantendo os intervalos) para o horário proposto.
async function acceptReschedule(tenantId: string, timezone: string, offer: OfferAppointment, replyJid: string, phoneDigits: string) {
  const proposed = offer.rescheduleProposedStartAt!;
  const visit = await prisma.appointment.findMany({
    where: { tenantId, customerId: offer.customerId, status: 'CONFIRMED', rescheduleProposedStartAt: proposed, rescheduleAcceptedAt: null },
    include: messageInclude,
    orderBy: { startAt: 'asc' },
  });
  const delta = proposed.getTime() - visit[0].startAt.getTime();
  // Para frente, atualiza do último para o primeiro: senão o primeiro
  // serviço remarcado encostaria no segundo e a trava anti-sobreposição do
  // banco recusaria.
  const ordered = delta > 0 ? [...visit].reverse() : visit;
  try {
    await prisma.$transaction(async (tx) => {
      for (const a of ordered) {
        await tx.appointment.update({
          where: { id: a.id },
          data: {
            startAt: new Date(a.startAt.getTime() + delta),
            endAt: new Date(a.endAt.getTime() + delta),
            rescheduleAcceptedAt: new Date(),
            clientConfirmedAt: a.clientConfirmedAt ?? new Date(),
            reminder2hSentAt: null,
          },
        });
      }
    });
  } catch (err) {
    // Alguém ocupou o horário entre a proposta e a resposta.
    logger.error({ err, appointmentId: offer.id }, 'Não deu para remarcar no horário proposto');
    await replyWhatsapp(tenantId, replyJid, 'Obrigada pela resposta! 💛 A Noely vai confirmar o seu novo horário com você em instantes.');
    return;
  }

  for (const a of visit) {
    await syncAppointmentToGoogle(a.id).catch((err) => logger.error({ err, appointmentId: a.id }, 'Falha ao atualizar o Google Agenda'));
  }
  logger.info({ appointmentId: offer.id, newStart: proposed.toISOString() }, 'Paciente aceitou o novo horário — remarcado');

  const done = await enabledTemplate(tenantId, 'RESCHEDULE_DONE');
  if (done) {
    const moved = await prisma.appointment.findMany({ where: { id: { in: visit.map((a) => a.id) } }, include: messageInclude, orderBy: { startAt: 'asc' } });
    await replyWhatsapp(tenantId, replyJid, renderTemplate(done, await buildVariables(tenantId, timezone, asVisit(moved))));
  }
  await markContactGreeted(tenantId, phoneDigits);
}

// --- 4. Lembretes ------------------------------------------------------
async function sendReminders(tenantId: string, timezone: string) {
  const now = new Date();
  const hour = Number(formatInTimeZone(now, timezone, 'H'));
  const quiet = hour >= QUIET_FROM_HOUR || hour < QUIET_UNTIL_HOUR;
  const include = messageInclude;

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
    // Com proposta de novo horário em aberto, o lembrete com o horário
    // antigo só confundiria — espera a paciente responder.
    return candidates.filter(
      (a) =>
        a.createdAt.getTime() <= a.startAt.getTime() - leadMs &&
        !(a.rescheduleOfferSentAt && a.rescheduleProposedStartAt && !a.rescheduleAcceptedAt),
    );
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
    const handled = new Set<string>();
    for (const appt of job.appts) {
      if (handled.has(appt.id)) continue;
      // Os outros serviços da mesma visita entram nesta mesma mensagem.
      const visit = await visitOf(appt);
      const ids = visit.map((a) => a.id);
      ids.forEach((id) => handled.add(id));
      try {
        await sendWhatsappText(tenantId, appt.customer.whatsapp, renderTemplate(job.template, await buildVariables(tenantId, timezone, asVisit(visit))));
        await prisma.appointment.updateMany({ where: { id: { in: ids } }, data: { [job.field]: new Date() } });
        await markContactGreeted(tenantId, appt.customer.whatsapp);
      } catch (err) {
        logger.error({ err, appointmentId: appt.id, reminder: job.field }, 'Falha ao enviar lembrete');
        // Número sem WhatsApp não vai passar a ter na próxima rodada: marca
        // como tratado para não tentar de novo a cada varredura.
        if (err instanceof Error && err.message.includes('não tem WhatsApp')) {
          await prisma.appointment.updateMany({ where: { id: { in: ids } }, data: { [job.field]: new Date() } });
        }
        // WhatsApp caiu no meio da rodada: para aqui; a próxima retoma.
        if (!isWhatsappConnected(tenantId)) return;
      }
    }
  }
}

// --- 5. Aniversário ------------------------------------------------------
// No dia do aniversário (data de nascimento do cadastro), a partir das 9h e
// até as 20h no horário da clínica: uma mensagem por paciente por ano.
// Quem faz 29/02 recebe em 28/02 nos anos que não são bissextos.
async function sendBirthdays(tenantId: string, timezone: string) {
  const now = new Date();
  const hour = Number(formatInTimeZone(now, timezone, 'H'));
  if (hour < 9 || hour >= 20) return;
  const template = await enabledTemplate(tenantId, 'BIRTHDAY');
  if (!template) return;

  const year = Number(formatInTimeZone(now, timezone, 'yyyy'));
  const today = formatInTimeZone(now, timezone, 'MM-dd');
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = today === '02-28' && !isLeap ? ['02-28', '02-29'] : [today];

  const due = await prisma.$queryRaw<{ id: string; name: string; whatsapp: string }[]>`
    SELECT "id", "name", "whatsapp" FROM "Customer"
    WHERE "tenantId" = ${tenantId}
      AND "birthDate" IS NOT NULL
      AND to_char("birthDate", 'MM-DD') = ANY(${days})
      AND ("birthdayMessageYear" IS NULL OR "birthdayMessageYear" < ${year})`;

  for (const customer of due) {
    try {
      await sendWhatsappText(tenantId, customer.whatsapp, renderTemplate(template, await buildVariables(tenantId, timezone, undefined, customer.name)));
      await prisma.customer.update({ where: { id: customer.id }, data: { birthdayMessageYear: year } });
      await markContactGreeted(tenantId, customer.whatsapp);
      logger.info({ customerId: customer.id }, 'Mensagem de aniversário enviada');
    } catch (err) {
      logger.error({ err, customerId: customer.id }, 'Falha ao enviar mensagem de aniversário');
      // Número sem WhatsApp não vai passar a ter: marca o ano para não tentar a cada minuto.
      if (err instanceof Error && err.message.includes('não tem WhatsApp')) {
        await prisma.customer.update({ where: { id: customer.id }, data: { birthdayMessageYear: year } });
      }
      if (!isWhatsappConnected(tenantId)) return;
    }
  }
}

let sweeping = false;

// Varredura a cada minuto: confirmações que ficaram para trás e lembretes.
// Uma rodada por vez (se a anterior ainda estiver enviando — a fila espaça
// as mensagens —, esta é pulada).
export function startReminderScheduler(intervalMs = 60_000) {
  const tick = async () => {
    if (sweeping) return;
    sweeping = true;
    try {
      const tenants = await prisma.tenant.findMany({ select: { id: true, timezone: true } });
      for (const tenant of tenants) {
        if (!isWhatsappConnected(tenant.id)) continue;
        await sendPendingConfirmations(tenant.id);
        await sendRescheduleOffers(tenant.id, tenant.timezone);
        await sendReminders(tenant.id, tenant.timezone);
        await sendBirthdays(tenant.id, tenant.timezone);
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
