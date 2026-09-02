import type { NextFunction, Request, Response } from 'express';
import type { AuditAction } from '@prisma/client';
import { recordAudit } from '../modules/audit/audit.service';

// Cada ação de escrita feita por um usuário AUTENTICADO do painel vira um
// registro de auditoria — automaticamente, sem precisar espalhar uma
// chamada manual em cada service (appointments, catalog, finance,
// inventory, users...). Um middleware global (montado uma vez em app.ts,
// ver ali) cobre TODA rota mutável de uma vez, presente e futura, em vez de
// depender de lembrar de instrumentar cada service novo manualmente.
//
// Por que funciona mesmo estando ANTES de requireAuth na cadeia: o handler
// aqui só roda de verdade dentro do listener de res.on('finish'), que só
// dispara depois que a resposta inteira já foi enviada — ou seja, depois de
// TODA a cadeia de middlewares/rota já ter executado, requireAuth incluído.
// req.user já está populado (ou não, se a rota era pública) nesse ponto.
interface AuditRule {
  entityType: string;
  action: AuditAction;
  // Extrai um rótulo legível (ex.: nome do serviço/categoria) do corpo
  // enviado e/ou do corpo da resposta — cada rota tem sua própria forma de
  // expor isso, então é mais simples (e mais preciso) que uma heurística
  // genérica tentando adivinhar em qualquer JSON.
  label: (body: Record<string, unknown>, resBody: Record<string, unknown> | undefined) => string | undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

// Chave = "MÉTODO padrão-da-rota", onde o padrão é req.baseUrl + req.route.path
// (ex.: "/catalog/admin" + "/categories/:id" = "/catalog/admin/categories/:id")
// — o mesmo padrão com :params, não a URL real com ids, então a tabela fica
// pequena e estável independente de quantos registros existirem.
const AUDIT_RULES: Record<string, AuditRule> = {
  'POST /auth/users': { entityType: 'user', action: 'CREATE', label: (body) => str(body.name) },
  'PATCH /auth/users/:id': {
    entityType: 'user',
    action: 'UPDATE',
    label: (_body, res) => str((res?.user as Record<string, unknown> | undefined)?.name),
  },
  'PATCH /appointments/:id/status': {
    entityType: 'appointment',
    action: 'UPDATE',
    label: (_body, res) => {
      const appt = res?.appointment as Record<string, unknown> | undefined;
      const customer = appt?.customer as Record<string, unknown> | undefined;
      const service = appt?.service as Record<string, unknown> | undefined;
      const parts = [str(customer?.name), str(service?.name)].filter(Boolean);
      return parts.length ? parts.join(' — ') : undefined;
    },
  },
  'POST /catalog/admin/categories': { entityType: 'category', action: 'CREATE', label: (body) => str(body.name) },
  'PATCH /catalog/admin/categories/:id': { entityType: 'category', action: 'UPDATE', label: (body) => str(body.name) },
  'POST /catalog/admin/categories/:categoryId/services': { entityType: 'service', action: 'CREATE', label: (body) => str(body.name) },
  'PATCH /catalog/admin/services/:id': { entityType: 'service', action: 'UPDATE', label: (body) => str(body.name) },
  'POST /finance/expenses': { entityType: 'expense', action: 'CREATE', label: (body) => str(body.description) },
  'PATCH /finance/expenses/:id': { entityType: 'expense', action: 'UPDATE', label: (body) => str(body.description) },
  'POST /finance/expenses/:id/pay': {
    entityType: 'expense',
    action: 'UPDATE',
    label: (_body, res) => str((res?.expense as Record<string, unknown> | undefined)?.description),
  },
  'DELETE /finance/expenses/:id': { entityType: 'expense', action: 'DELETE', label: () => undefined },
  'POST /finance/bank/import': {
    entityType: 'bank_transaction',
    action: 'CREATE',
    label: (_body, res) => (res ? `${res.imported ?? 0} transação(ões) importada(s)` : undefined),
  },
  'POST /finance/bank/transactions/:id/match': { entityType: 'bank_transaction', action: 'UPDATE', label: () => 'conciliada' },
  'POST /finance/bank/transactions/:id/unmatch': { entityType: 'bank_transaction', action: 'UPDATE', label: () => 'conciliação desfeita' },
  'POST /finance/bank/transactions/:id/ignore': { entityType: 'bank_transaction', action: 'UPDATE', label: () => 'ignorada' },
  'POST /inventory': { entityType: 'inventory_item', action: 'CREATE', label: (body) => str(body.name) },
  'PATCH /inventory/:id': { entityType: 'inventory_item', action: 'UPDATE', label: (body) => str(body.name) },
  'POST /inventory/:id/adjust': {
    entityType: 'inventory_item',
    action: 'UPDATE',
    label: (body, res) => {
      const item = res?.item as Record<string, unknown> | undefined;
      const delta = body.delta as number | undefined;
      const name = str(item?.name);
      if (!name) return undefined;
      return delta != null ? `${name} (${delta > 0 ? '+' : ''}${delta})` : name;
    },
  },
};

// Nunca persistir isso em texto puro num log — mesmo sendo "só" auditoria
// interna, uma senha em claro num registro de auditoria é exatamente o tipo
// de coisa que um dump de banco/backup vazado transformaria num incidente
// sério. Redação recursiva porque nada garante que um payload futuro nunca
// vai aninhar um desses campos um nível mais fundo.
const SENSITIVE_KEYS = new Set(['password', 'passwordHash', 'token', 'authorization']);

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[redacted]' : redact(val);
    }
    return out;
  }
  return value;
}

function entityIdFromResponse(resBody: Record<string, unknown> | undefined): string | undefined {
  if (!resBody) return undefined;
  for (const key of ['category', 'service', 'expense', 'item', 'user', 'appointment', 'transaction']) {
    const entity = resBody[key] as Record<string, unknown> | undefined;
    if (entity && typeof entity.id === 'string') return entity.id;
  }
  return undefined;
}

export function auditLogger(req: Request, res: Response, next: NextFunction) {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return next();

  // Captura o corpo da resposta sem interferir no envio real — só
  // guardamos uma referência pra ler depois, dentro do listener de finish.
  let responseBody: Record<string, unknown> | undefined;
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (body && typeof body === 'object') responseBody = body as Record<string, unknown>;
    return originalJson(body);
  }) as Response['json'];

  res.on('finish', () => {
    if (res.statusCode >= 400) return; // só ações que de fato aconteceram
    if (!req.user || !req.tenant) return; // sem usuário autenticado = não é ação de staff (ex.: booking público)

    const routePattern = req.route?.path;
    if (!routePattern) return;
    const key = `${req.method} ${req.baseUrl}${routePattern}`;
    const rule = AUDIT_RULES[key];
    if (!rule) return; // rota mutável sem regra mapeada — melhor não logar do que logar errado

    const entityId = req.params?.id ?? req.params?.categoryId ?? entityIdFromResponse(responseBody);
    const entityLabel = rule.label((req.body as Record<string, unknown>) ?? {}, responseBody);

    recordAudit({
      tenantId: req.tenant.id,
      userId: req.user.id,
      userName: req.user.name,
      action: rule.action,
      entityType: rule.entityType,
      entityId,
      entityLabel,
      method: req.method,
      path: key,
      changes: redact(req.body) as never,
    }).catch((err) => req.log?.error({ err }, 'Falha ao gravar log de auditoria'));
  });

  next();
}
