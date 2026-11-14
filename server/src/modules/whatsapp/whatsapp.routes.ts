import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import { connectWhatsapp, disconnectWhatsapp, getWhatsappState, isWhatsappConnected, sendWhatsappText } from './whatsapp-connection';
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
