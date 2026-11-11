import { existsSync } from 'fs';
import { chmod, mkdir, rm } from 'fs/promises';
import path from 'path';
import pino from 'pino';
import QRCode from 'qrcode';
import type { proto, WASocket } from '@whiskeysockets/baileys';
import { env } from '../../config/env';

// Conexão com o WhatsApp por QR code (aparelho vinculado, o mesmo mecanismo
// do WhatsApp Web) via Baileys — protocolo direto, sem abrir um navegador no
// servidor. NÃO é a API oficial da Meta: é gratuito por mensagem, mas viola
// os termos do WhatsApp e o número pode ser bloqueado se enviar em excesso
// (decisão consciente da clínica, ver DEPLOY.md). Por isso os envios passam
// por uma fila com intervalo aleatório entre mensagens (ver enqueue).
//
// Uma conexão por clínica (tenant), mantida em memória. A sessão fica em
// disco (pasta por tenant, permissão só do dono): equivale a um login no
// WhatsApp da clínica — quem tiver esses arquivos consegue enviar como ela.

export type WhatsappStatus = 'disconnected' | 'connecting' | 'qr' | 'connected';

interface TenantConnection {
  socket: WASocket | null;
  status: WhatsappStatus;
  qrDataUrl: string | null;
  phone: string | null;
  // Evita reconectar em loop quando a própria clínica desconectou.
  manualStop: boolean;
  queue: Promise<unknown>;
}

// Mensagem recebida de uma pessoa (não de grupo/status/canal, não enviada
// pela própria clínica). `replyJid` é o endereço da conversa, para responder
// nela mesma; `phoneDigits` é o número de quem escreveu.
export interface IncomingWhatsappMessage {
  tenantId: string;
  phoneDigits: string;
  pushName: string | null;
  text: string;
  replyJid: string;
}

const connections = new Map<string, TenantConnection>();

// Cópia das mensagens enviadas, para reenviar quando um aparelho pede de
// novo: o celular da paciente ou os outros aparelhos da clínica (celular,
// WhatsApp Web) às vezes não conseguem decifrar na primeira vez e pedem
// reenvio. Sem esta cópia o reenvio não acontecia e a mensagem ficava em
// "Aguardando mensagem. Essa ação pode levar alguns instantes".
// shortcut: só em memória (some ao reiniciar o servidor); pedidos de reenvio
// chegam em segundos/minutos, então basta — gravar em disco se voltar a
// aparecer "Aguardando" logo depois de deploys.
const SENT_CACHE_LIMIT = 1000;
const sentMessages = new Map<string, proto.IMessage>();

function rememberSent(tenantId: string, sent: proto.IWebMessageInfo | undefined) {
  if (!sent?.key?.id || !sent.message) return;
  sentMessages.set(`${tenantId}:${sent.key.id}`, sent.message);
  if (sentMessages.size > SENT_CACHE_LIMIT) sentMessages.delete(sentMessages.keys().next().value!);
}
const logger = pino({ level: 'warn' }).child({ module: 'whatsapp' });

const SESSION_ROOT = env.WHATSAPP_SESSION_DIR ?? path.resolve(__dirname, '../../../.whatsapp-session');

// Mensagens mais antigas que isto não disparam resposta: ao reconectar, o
// WhatsApp entrega o que chegou enquanto o servidor estava fora — responder
// a tudo isso de uma vez, horas depois, não faria sentido.
const MAX_INCOMING_AGE_SECONDS = 5 * 60;

// Registrado pelo módulo de automação (whatsapp-automation.ts) — por
// callback, e não import direto, para os dois módulos não se importarem em
// círculo.
let incomingHandler: ((message: IncomingWhatsappMessage) => Promise<void>) | null = null;
export function onIncomingWhatsappMessage(handler: (message: IncomingWhatsappMessage) => Promise<void>) {
  incomingHandler = handler;
}

// Mensagem que a Noely mandou pelo celular (ou WhatsApp Web) numa conversa
// — conta como conversa ativa, para a Saudação não cair no meio do papo.
let outgoingHandler: ((tenantId: string, phoneDigits: string) => Promise<void>) | null = null;
export function onOutgoingWhatsappMessage(handler: (tenantId: string, phoneDigits: string) => Promise<void>) {
  outgoingHandler = handler;
}

// Conversas com endereço opaco (@lid) só trazem o número nas mensagens que
// a pessoa manda; as que a Noely manda para ela vêm só com o @lid. Guarda o
// par visto na última mensagem recebida para reconhecer a conversa depois.
// shortcut: só em memória — depois de reiniciar, a mensagem da Noely para
// um @lid ainda não visto não conta como atividade até a pessoa escrever.
const LID_CACHE_LIMIT = 5000;
const lidToPhone = new Map<string, string>();
function rememberLid(lid: string, phoneDigits: string) {
  lidToPhone.set(lid, phoneDigits);
  if (lidToPhone.size > LID_CACHE_LIMIT) lidToPhone.delete(lidToPhone.keys().next().value!);
}

function sessionDir(tenantId: string) {
  // tenantId é um cuid gerado pelo banco — nunca input do usuário — mas o
  // nome da pasta é validado mesmo assim (segunda camada contra path
  // traversal, mesmo raciocínio de assertSafeKey em lib/file-storage.ts).
  if (!/^[a-z0-9]+$/i.test(tenantId)) throw new Error('Tenant inválido.');
  return path.join(SESSION_ROOT, tenantId);
}

function getConnection(tenantId: string): TenantConnection {
  let conn = connections.get(tenantId);
  if (!conn) {
    conn = { socket: null, status: 'disconnected', qrDataUrl: null, phone: null, manualStop: false, queue: Promise.resolve() };
    connections.set(tenantId, conn);
  }
  return conn;
}

// O Baileys 6.x é só ESM e este servidor compila para CommonJS: um import()
// comum seria reescrito pelo TypeScript como require(). new Function mantém
// o import() dinâmico de verdade.
const importEsm = new Function('specifier', 'return import(specifier)') as (s: string) => Promise<typeof import('@whiskeysockets/baileys')>;

export function getWhatsappState(tenantId: string) {
  const conn = getConnection(tenantId);
  return { status: conn.status, qrDataUrl: conn.status === 'qr' ? conn.qrDataUrl : null, phone: conn.phone };
}

export function isWhatsappConnected(tenantId: string) {
  return getConnection(tenantId).status === 'connected';
}

export async function connectWhatsapp(tenantId: string): Promise<void> {
  const conn = getConnection(tenantId);
  if (conn.socket && conn.status !== 'disconnected') return;
  conn.manualStop = false;
  const baileys = await importEsm('@whiskeysockets/baileys');
  const makeWASocket = (baileys as unknown as { default: typeof baileys.makeWASocket }).default ?? baileys.makeWASocket;

  const dir = sessionDir(tenantId);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700).catch(() => undefined);
  const { state, saveCreds } = await baileys.useMultiFileAuthState(dir);
  const { version } = await baileys.fetchLatestBaileysVersion().catch(() => ({ version: undefined }));

  // Só depois da preparação: se a pasta da sessão falhar acima, o status
  // continua "disconnected" e o painel mostra o erro em vez de travar em
  // "Conectando…".
  conn.status = 'connecting';
  const socket = makeWASocket({
    auth: state,
    ...(version ? { version } : {}),
    logger: logger as never,
    browser: baileys.Browsers.appropriate('Painel Noely Cerqueira'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    printQRInTerminal: false,
    getMessage: async (key) => (key.id ? sentMessages.get(`${tenantId}:${key.id}`) : undefined),
  });
  conn.socket = socket;

  socket.ev.on('creds.update', saveCreds);

  // type 'append' também conta: é como o WhatsApp entrega o que chegou
  // enquanto a conexão estava caindo/voltando (o servidor reconecta várias
  // vezes por dia). Antes só 'notify' era tratado, e quem escrevia nesses
  // segundos ficava sem resposta. O limite de idade abaixo continua valendo
  // para os dois. Mensagens enviadas pela clínica (fromMe) nunca disparam
  // resposta: só marcam a conversa como ativa (ver outgoingHandler).
  socket.ev.on('messages.upsert', ({ messages, type }) => {
    if ((type !== 'notify' && type !== 'append') || !incomingHandler) return;
    let tooOld = 0;
    for (const message of messages) {
      const jid = message.key.remoteJid ?? '';
      if (!jid) continue;
      if (jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) continue;
      const sentAt = Number(message.messageTimestamp ?? 0);
      const isOld = Boolean(sentAt && Date.now() / 1000 - sentAt > MAX_INCOMING_AGE_SECONDS);

      // Conversa com endereço de telefone traz o número no próprio jid;
      // contas novas usam um identificador opaco (@lid) e o número vem à
      // parte (senderPn / remoteJidAlt, conforme a versão do protocolo).
      const key = message.key as typeof message.key & { senderPn?: string; remoteJidAlt?: string };
      const phoneJid = jid.endsWith('@s.whatsapp.net') ? jid : (key.senderPn ?? key.remoteJidAlt);
      const phoneDigits = phoneJid ? phoneJid.split('@')[0].split(':')[0] : lidToPhone.get(jid);
      if (phoneJid && jid.endsWith('@lid')) rememberLid(jid, phoneJid.split('@')[0].split(':')[0]);

      if (message.key.fromMe) {
        // 'notify' = enviada de outro aparelho da clínica (o celular da
        // Noely). As que este servidor envia chegam como 'append' e já são
        // registradas por quem enviou (markContactGreeted).
        if (type === 'notify' && !isOld && phoneDigits && outgoingHandler) {
          outgoingHandler(tenantId, phoneDigits).catch((err) => logger.error({ err, tenantId }, 'Falha ao registrar mensagem enviada'));
        }
        continue;
      }

      if (isOld) {
        tooOld++;
        continue;
      }
      if (!phoneDigits) {
        // Sem o número não dá para achar a paciente (nem o "SIM" dela).
        logger.warn({ tenantId, jid }, 'Mensagem recebida sem número de telefone');
        continue;
      }

      const text = message.message?.conversation ?? message.message?.extendedTextMessage?.text ?? '';
      incomingHandler({
        tenantId,
        phoneDigits,
        pushName: message.pushName ?? null,
        text,
        replyJid: jid,
      }).catch((err) => logger.error({ err, tenantId }, 'Falha ao tratar mensagem recebida'));
    }
    if (tooOld) logger.warn({ tenantId, type, count: tooOld }, 'Mensagens recebidas antigas demais para resposta automática');
  });

  socket.ev.on('connection.update', async (update) => {
    if (update.qr) {
      conn.status = 'qr';
      conn.qrDataUrl = await QRCode.toDataURL(update.qr, { margin: 1, width: 320 });
    }
    if (update.connection === 'open') {
      conn.status = 'connected';
      conn.qrDataUrl = null;
      conn.phone = socket.user?.id?.split(':')[0]?.split('@')[0] ?? null;
      logger.warn({ tenantId }, 'WhatsApp conectado');
    }
    if (update.connection === 'close') {
      conn.socket = null;
      conn.qrDataUrl = null;
      const statusCode = (update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
      if (statusCode === baileys.DisconnectReason.loggedOut) {
        // Desconectado pelo celular ("Aparelhos conectados" > sair): a
        // sessão salva não serve mais — apaga para o próximo "Conectar"
        // gerar um QR novo.
        await rm(dir, { recursive: true, force: true });
        conn.status = 'disconnected';
        conn.phone = null;
        logger.warn({ tenantId }, 'WhatsApp desconectado pelo aparelho');
        return;
      }
      if (conn.manualStop) {
        conn.status = 'disconnected';
        return;
      }
      // Queda de rede/reinício do lado do WhatsApp: reconecta sozinho.
      conn.status = 'connecting';
      setTimeout(() => connectWhatsapp(tenantId).catch((err) => logger.error({ err, tenantId }, 'Falha ao reconectar')), 3000);
    }
  });
}

// "Desconectar" no painel: encerra a sessão no WhatsApp (some de "Aparelhos
// conectados" no celular) e apaga a sessão salva.
export async function disconnectWhatsapp(tenantId: string): Promise<void> {
  const conn = getConnection(tenantId);
  conn.manualStop = true;
  try {
    await conn.socket?.logout();
  } catch {
    conn.socket?.end(undefined);
  }
  conn.socket = null;
  conn.status = 'disconnected';
  conn.qrDataUrl = null;
  conn.phone = null;
  await rm(sessionDir(tenantId), { recursive: true, force: true });
}

// Ao subir o servidor, reconecta as clínicas que já tinham sessão salva —
// sem isso, todo deploy/reinício exigiria escanear o QR de novo.
export async function restoreWhatsappSessions(tenantIds: string[]) {
  for (const tenantId of tenantIds) {
    if (existsSync(path.join(sessionDir(tenantId), 'creds.json'))) {
      await connectWhatsapp(tenantId).catch((err) => logger.error({ err, tenantId }, 'Falha ao restaurar sessão do WhatsApp'));
    }
  }
}

// Brasil: números cadastrados sem o 55 ganham o código do país.
function toE164Digits(raw: string) {
  const digits = raw.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}

// Chave para comparar telefones brasileiros: DDD + 8 últimos dígitos. O
// mesmo celular aparece com e sem o 55, e com ou sem o 9º dígito (contas
// antigas do WhatsApp ficaram registradas sem ele).
export function phoneKey(raw: string) {
  const national = toE164Digits(raw).slice(2);
  return national.slice(0, 2) + national.slice(-8);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Fila por clínica: um envio por vez, com 3 a 6 segundos entre mensagens —
// rajadas instantâneas de mensagens automáticas são o padrão que mais leva
// o WhatsApp a bloquear números conectados por aparelho.
function enqueue<T>(tenantId: string, task: () => Promise<T>): Promise<T> {
  const conn = getConnection(tenantId);
  const run = conn.queue.then(async () => {
    const result = await task();
    await sleep(3000 + Math.random() * 3000);
    return result;
  });
  conn.queue = run.catch(() => undefined);
  return run;
}

function connectedSocket(tenantId: string) {
  const conn = getConnection(tenantId);
  if (conn.status !== 'connected' || !conn.socket) throw new Error('WhatsApp da clínica não está conectado.');
  return conn.socket;
}

export async function sendWhatsappText(tenantId: string, phone: string, text: string): Promise<void> {
  return enqueue(tenantId, async () => {
    const socket = connectedSocket(tenantId);
    // onWhatsApp resolve o identificador real do contato — no Brasil, contas
    // antigas às vezes estão registradas SEM o 9º dígito do celular, e
    // mandar para o número "como digitado" falharia em silêncio.
    const [result] = (await socket.onWhatsApp(toE164Digits(phone))) ?? [];
    if (!result?.exists) throw new Error('Este número não tem WhatsApp.');
    rememberSent(tenantId, await socket.sendMessage(result.jid, { text }));
  });
}

// Resposta dentro de uma conversa que a pessoa abriu (Saudação, resposta ao
// "SIM") — vai para o mesmo endereço de onde a mensagem veio.
export async function replyWhatsapp(tenantId: string, jid: string, text: string): Promise<void> {
  return enqueue(tenantId, async () => {
    rememberSent(tenantId, await connectedSocket(tenantId).sendMessage(jid, { text }));
  });
}
