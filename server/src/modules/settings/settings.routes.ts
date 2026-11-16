import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import { getPublicSettings, getSchedule, saveContact, saveSchedule } from './settings.service';

export const settingsRouter = Router();

settingsRouter.get(
  '/public',
  asyncHandler(async (req, res) => {
    const settings = await getPublicSettings(req.tenant.id);
    res.json(settings);
  }),
);

// Horário de funcionamento + almoço. A recepção vê (a agenda do painel usa
// para montar a linha do tempo do dia); só ADMIN altera.
settingsRouter.get(
  '/schedule',
  requireAuth,
  requireRole('ADMIN', 'RECEPTION'),
  asyncHandler(async (req, res) => {
    res.json(await getSchedule(req.tenant.id));
  }),
);

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido (use HH:MM).');
const scheduleSchema = z.object({
  days: z
    .array(z.object({ weekday: z.number().int().min(0).max(6), open: z.boolean(), opensAt: time, closesAt: time }))
    .length(7)
    .refine((days) => new Set(days.map((d) => d.weekday)).size === 7, 'Informe os 7 dias da semana.'),
  lunch: z.object({ enabled: z.boolean(), start: time, end: time }),
});

// Contato do site (WhatsApp, Instagram, e-mail, endereço, mapa). Só ADMIN.
const contactSchema = z.object({
  whatsapp: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v.length >= 12 && v.length <= 13, 'WhatsApp: use DDI + DDD + número, ex.: 55 71 99999-9999.'),
  instagram: z
    .string()
    .trim()
    .transform((v) => (v.startsWith('@') ? v : `@${v}`))
    .refine((v) => /^@[\w.]{1,30}$/.test(v), 'Instagram inválido (ex.: @noelycerqueira).'),
  email: z.string().trim().email('E-mail inválido.'),
  address: z.string().trim().min(5, 'Informe o endereço.').max(200),
  addressMapUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === '' || /^https:\/\//.test(v), 'O link do mapa precisa começar com https://')
    .transform((v) => v || null),
});

settingsRouter.put(
  '/contact',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    res.json(await saveContact(req.tenant.id, contactSchema.parse(req.body)));
  }),
);

settingsRouter.put(
  '/schedule',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    res.json(await saveSchedule(req.tenant.id, scheduleSchema.parse(req.body)));
  }),
);
