import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { NotFoundError } from '../utils/errors';

// Hoje existe um único tenant (Noely Cerqueira), mas toda consulta já passa
// por aqui em vez de assumir um id fixo espalhado pelo código — é o ponto
// único de resolução de tenant, pronto para múltiplos tenants no futuro
// (por header, subdomínio, etc.) sem tocar nas rotas de negócio.
const DEFAULT_TENANT_SLUG = 'noely-cerqueira';

export async function resolveTenant(req: Request, _res: Response, next: NextFunction) {
  try {
    const slug = (req.header('x-tenant-slug') || DEFAULT_TENANT_SLUG).trim();
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) {
      throw new NotFoundError('Clínica não encontrada.');
    }
    req.tenant = tenant;
    next();
  } catch (err) {
    next(err);
  }
}
