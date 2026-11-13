import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { asyncHandler } from '../../utils/async-handler';
import { AppError, NotFoundError } from '../../utils/errors';
import { prisma } from '../../lib/prisma';
import { isSupportedImageMime, readSiteImage, saveSiteImage } from '../../lib/file-storage';
import { requireAuth, requireRole } from '../auth/auth.middleware';

// Textos e fotos do site público editáveis pela clínica no painel (Painel →
// Site). Guardado como um mapa chave → texto; chave ausente = texto padrão,
// que mora no próprio site (web/src/data/site-content.ts). Só as chaves desta
// lista são aceitas.
const TEXT_KEYS = [
  'home.heroTitle', 'home.heroLead', 'home.heroCaption', 'home.featuredText', 'home.aboutTitle', 'home.aboutText',
  'home.specialtiesLead', 'home.step1Title', 'home.step1Text', 'home.step2Title', 'home.step2Text', 'home.step3Title',
  'home.step3Text', 'home.why1Title', 'home.why1Text', 'home.why2Title', 'home.why2Text', 'home.why3Title', 'home.why3Text',
  'home.instagramText', 'home.ctaTitle',
  'services.title', 'services.description', 'booking.title', 'booking.description', 'contact.title', 'contact.description',
] as const;
const IMAGE_KEYS = ['home.heroPhoto', 'services.image', 'booking.image', 'contact.image'] as const;

// Foto: uma enviada pelo painel ou uma das que já vêm com o site.
const imageValue = z
  .string()
  .max(300)
  .regex(/^\/(site-content\/images\/[a-z0-9]+\/[a-f0-9-]+\.(jpg|png|webp)|services\/[\w./-]+|brand\/[\w./-]+)$/i, 'Foto inválida.');

const updateSchema = z.object({
  content: z
    .object(
      Object.fromEntries([
        ...TEXT_KEYS.map((k) => [k, z.string().trim().min(1).max(600).nullable().optional()]),
        ...IMAGE_KEYS.map((k) => [k, imageValue.nullable().optional()]),
      ]) as Record<string, z.ZodTypeAny>,
    )
    .strict(),
});

export const siteContentRouter = Router();

async function readContent(tenantId: string) {
  const row = await prisma.siteContent.findUnique({ where: { tenantId } });
  return (row?.data ?? {}) as Record<string, string>;
}

siteContentRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ content: await readContent(req.tenant.id) });
  }),
);

siteContentRouter.put(
  '/',
  requireAuth,
  requireRole('ADMIN', 'RECEPTION'),
  asyncHandler(async (req, res) => {
    const { content } = updateSchema.parse(req.body);
    const next = { ...(await readContent(req.tenant.id)) };
    for (const [key, value] of Object.entries(content)) {
      if (value === undefined) continue;
      if (value === null) delete next[key]; // volta ao texto/foto padrão
      else next[key] = value as string;
    }
    const data = next as Prisma.InputJsonValue;
    await prisma.siteContent.upsert({
      where: { tenantId: req.tenant.id },
      create: { tenantId: req.tenant.id, data },
      update: { data },
    });
    res.json({ content: next });
  }),
);

const imageSchema = z.object({
  mimeType: z.string(),
  // ~7 MB em base64 (o painel já reduz a foto antes de enviar).
  base64Data: z.string().min(1).max(9_500_000),
});

siteContentRouter.post(
  '/images',
  requireAuth,
  requireRole('ADMIN', 'RECEPTION'),
  asyncHandler(async (req, res) => {
    const { mimeType, base64Data } = imageSchema.parse(req.body);
    if (!isSupportedImageMime(mimeType)) throw new AppError('Envie uma foto JPG, PNG ou WebP.', 422, 'INVALID_IMAGE');
    const url = await saveSiteImage(req.tenant.id, mimeType, base64Data);
    res.status(201).json({ url });
  }),
);

const MIME_BY_EXT: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

// Fotos do site: públicas, servidas para o site (outro domínio) — por isso o
// Cross-Origin-Resource-Policy liberado e cache longo (nome único por foto).
siteContentRouter.get(
  '/images/:tenantId/:file',
  asyncHandler(async (req, res) => {
    const { tenantId, file } = req.params;
    const match = /^[a-f0-9-]+\.(jpg|png|webp)$/i.exec(file);
    if (!/^[a-z0-9]+$/i.test(tenantId) || !match) throw new NotFoundError('Foto não encontrada.');
    const buffer = await readSiteImage(`site/${tenantId}/${file}`).catch(() => null);
    if (!buffer) throw new NotFoundError('Foto não encontrada.');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.type(MIME_BY_EXT[match[1].toLowerCase()]);
    res.send(buffer);
  }),
);
