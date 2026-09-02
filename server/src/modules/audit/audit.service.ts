import { prisma } from '../../lib/prisma';
import type { AuditAction, Prisma } from '@prisma/client';

interface RecordAuditInput {
  tenantId: string;
  userId: string;
  userName: string;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  method: string;
  path: string;
  changes?: Prisma.InputJsonValue | null;
}

// Fire-and-forget por design: quem chama (audit.middleware.ts) nunca deve
// deixar uma falha aqui derrubar a resposta real já enviada ao usuário — a
// auditoria observa o sistema, não faz parte do fluxo crítico dele.
export async function recordAudit(input: RecordAuditInput) {
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      userName: input.userName,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      entityLabel: input.entityLabel ?? null,
      method: input.method,
      path: input.path,
      changes: input.changes ?? undefined,
    },
  });
}

interface ListAuditLogsInput {
  tenantId: string;
  userId?: string;
  entityType?: string;
  action?: AuditAction;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export async function listAuditLogs({ tenantId, userId, entityType, action, from, to, page, pageSize }: ListAuditLogsInput) {
  const where: Prisma.AuditLogWhereInput = {
    tenantId,
    ...(userId ? { userId } : {}),
    ...(entityType ? { entityType } : {}),
    ...(action ? { action } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {}),
  };

  const [logs, total, entityTypes, users] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
    // Alimenta o filtro de "tipo de registro" da tela com os valores que
    // REALMENTE existem no histórico do tenant, em vez de uma lista fixa no
    // frontend que ficaria desatualizada assim que um novo tipo de ação
    // fosse adicionado ao backend (ver AUDIT_RULES em audit.middleware.ts).
    prisma.auditLog.findMany({ where: { tenantId }, distinct: ['entityType'], select: { entityType: true } }),
    prisma.auditLog.findMany({
      where: { tenantId },
      distinct: ['userId'],
      select: { userId: true, userName: true },
      orderBy: { userName: 'asc' },
    }),
  ]);

  return {
    logs,
    total,
    page,
    pageSize,
    entityTypes: entityTypes.map((e) => e.entityType).sort(),
    users,
  };
}
