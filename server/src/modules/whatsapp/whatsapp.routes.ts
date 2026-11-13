import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import { connectWhatsapp, disconnectWhatsapp, getWhatsappState, isWhatsappConnected, sendWhatsappText, syncPhoneContacts } from './whatsapp-connection';
import { audienceCounts, cancelBroadcast, createBroadcast, DEFAULT_BROADCAST_MESSAGE, listBroadcasts, renderBroadcast } from './whatsapp-broadcast';
import { AppError } from '../../utils/errors';

export const whatsappRouter = Router();

// Status: ADMIN e RECEPÇÃO veem se o WhatsApp está conectado. Conectar,
// desconectar e testar: só ADMIN — conectar vincula o WhatsApp da clínica
// ao sistema, equivalente a entregar a chave da conta.
whatsappRouter.use(requireAuth);

whatsappRouter.get('/status', requireRole('ADMIN', 'RECEPTION'), (req, res) => {
  res.json(getWhatsappState(req.tenant.id));
});

whatsappRouter.post(
  '/connect',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    await connectWhatsapp(req.tenant.id);
    res.json(getWhatsappState(req.tenant.id));
  }),
);

whatsappRouter.post(
  '/disconnect',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    await disconnectWhatsapp(req.tenant.id);
    res.json(getWhatsappState(req.tenant.id));
  }),
);

// Mensagem de teste para um número informado no painel — confere a conexão
// e como a formatação chega no celular antes de ligar os envios.
const testSchema = z.object({
  phone: z.string().regex(/^\+?\d{10,15}$/, 'Use apenas números, com DDD.'),
  text: z.string().trim().min(1).max(4000),
});

whatsappRouter.post(
  '/test',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const { phone, text } = testSchema.parse(req.body);
    if (!isWhatsappConnected(req.tenant.id)) throw new AppError('Conecte o WhatsApp antes de enviar um teste.', 409, 'WHATSAPP_DISCONNECTED');
    try {
      await sendWhatsappText(req.tenant.id, phone, text);
    } catch (err) {
      throw new AppError(err instanceof Error ? err.message : 'Não foi possível enviar.', 422, 'WHATSAPP_SEND_FAILED');
    }
    res.json({ ok: true });
  }),
);

// --- Lista de transmissão (só ADMIN) ---------------------------------------
whatsappRouter.get(
  '/broadcast',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const [audience, broadcasts] = await Promise.all([audienceCounts(req.tenant.id), listBroadcasts(req.tenant.id)]);
    res.json({
      audience,
      broadcasts,
      defaultMessage: DEFAULT_BROADCAST_MESSAGE,
      preview: renderBroadcast(DEFAULT_BROADCAST_MESSAGE, 'Maria', req.tenant.timezone),
    });
  }),
);

whatsappRouter.post(
  '/broadcast/preview',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const { message } = z.object({ message: z.string().min(1).max(4000) }).parse(req.body);
    res.json({ preview: renderBroadcast(message, 'Maria', req.tenant.timezone) });
  }),
);

whatsappRouter.post(
  '/broadcast',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const { message, sources } = z
      .object({ message: z.string().trim().min(10).max(4000), sources: z.array(z.enum(['contacts', 'patients'])).min(1) })
      .parse(req.body);
    try {
      const broadcast = await createBroadcast(req.tenant.id, message, sources, req.user!.name);
      res.status(201).json({ broadcast: { id: broadcast.id, total: broadcast.total } });
    } catch (err) {
      throw new AppError(err instanceof Error ? err.message : 'Não foi possível criar a transmissão.', 422, 'BROADCAST_INVALID');
    }
  }),
);

whatsappRouter.post(
  '/broadcast/:id/cancel',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    await cancelBroadcast(req.tenant.id, req.params.id);
    res.json({ ok: true });
  }),
);

whatsappRouter.post(
  '/contacts/sync',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    try {
      await syncPhoneContacts(req.tenant.id);
    } catch (err) {
      throw new AppError(err instanceof Error ? err.message : 'Não foi possível sincronizar.', 422, 'SYNC_FAILED');
    }
    res.json({ ok: true });
  }),
);
