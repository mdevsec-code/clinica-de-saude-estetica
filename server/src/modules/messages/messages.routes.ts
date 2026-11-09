import type { MessageTemplateKey } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import { listMessageTemplates, resetMessageTemplate, saveMessageTemplate } from './messages.service';

export const messagesRouter = Router();

// Leitura: ADMIN e RECEPÇÃO. Edição dos textos e do liga/desliga: só ADMIN
// (é a voz da clínica falando com as pacientes).
messagesRouter.use(requireAuth);

const keySchema = z.enum(['WELCOME', 'CONFIRMATION', 'CONFIRMATION_THANKS', 'REMINDER_DAY_BEFORE', 'REMINDER_2H']);
const updateSchema = z
  .object({
    body: z.string().trim().min(1, 'A mensagem não pode ficar vazia.').max(4000, 'A mensagem pode ter no máximo 4000 caracteres.').optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => v.body !== undefined || v.enabled !== undefined, 'Nada para salvar.');

messagesRouter.get(
  '/',
  requireRole('ADMIN', 'RECEPTION'),
  asyncHandler(async (req, res) => {
    res.json({ templates: await listMessageTemplates(req.tenant.id) });
  }),
);

messagesRouter.put(
  '/:key',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const key = keySchema.parse(req.params.key) as MessageTemplateKey;
    await saveMessageTemplate(req.tenant.id, key, updateSchema.parse(req.body));
    res.json({ templates: await listMessageTemplates(req.tenant.id) });
  }),
);

messagesRouter.delete(
  '/:key',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const key = keySchema.parse(req.params.key) as MessageTemplateKey;
    await resetMessageTemplate(req.tenant.id, key);
    res.json({ templates: await listMessageTemplates(req.tenant.id) });
  }),
);
