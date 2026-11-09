import type { MessageTemplateKey } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { DEFAULT_MESSAGE_TEMPLATES, MESSAGE_TEMPLATE_KEYS } from './message-defaults';

// Os três modelos da clínica, sempre completos: o texto salvo quando existe,
// senão o padrão. `isDefault` deixa o painel saber se há o que restaurar;
// `enabled` liga/desliga o envio automático daquele modelo (padrão: ligado).
export async function listMessageTemplates(tenantId: string) {
  const saved = await prisma.messageTemplate.findMany({ where: { tenantId } });
  const byKey = new Map(saved.map((t) => [t.key, t]));

  return MESSAGE_TEMPLATE_KEYS.map((key) => {
    const row = byKey.get(key);
    const body = row?.body ?? DEFAULT_MESSAGE_TEMPLATES[key];
    return {
      key,
      body,
      defaultBody: DEFAULT_MESSAGE_TEMPLATES[key],
      enabled: row?.enabled ?? true,
      isDefault: body === DEFAULT_MESSAGE_TEMPLATES[key],
      updatedAt: row?.updatedAt ?? null,
    };
  });
}

export async function saveMessageTemplate(
  tenantId: string,
  key: MessageTemplateKey,
  input: { body?: string; enabled?: boolean },
) {
  return prisma.messageTemplate.upsert({
    where: { tenantId_key: { tenantId, key } },
    create: { tenantId, key, body: input.body ?? DEFAULT_MESSAGE_TEMPLATES[key], enabled: input.enabled ?? true },
    update: { ...(input.body !== undefined ? { body: input.body } : {}), ...(input.enabled !== undefined ? { enabled: input.enabled } : {}) },
  });
}

// "Restaurar padrão": volta o TEXTO ao padrão, mantendo o liga/desliga.
export async function resetMessageTemplate(tenantId: string, key: MessageTemplateKey) {
  await prisma.messageTemplate.updateMany({ where: { tenantId, key }, data: { body: DEFAULT_MESSAGE_TEMPLATES[key] } });
}
