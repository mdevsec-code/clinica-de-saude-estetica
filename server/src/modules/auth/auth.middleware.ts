import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { UserRole } from '@prisma/client';
import { env } from '../../config/env';
import { ForbiddenError, UnauthorizedError } from '../../utils/errors';

interface TokenPayload {
  sub: string;
  tenantId: string;
  role: UserRole;
  email: string;
  name: string;
}

function authenticateToken(req: Request, token: string | undefined): boolean {
  if (!token) return false;

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;

    // O token prova a que tenant o usuário pertence; a requisição já resolveu
    // um tenant (por header/subdomínio, ver tenant.middleware.ts). Se os dois
    // não baterem, é uma tentativa de usar credenciais de um tenant para agir
    // sobre dados de outro — nunca deixar passar, mesmo hoje com um único
    // tenant em produção (item 7 do escopo: isolamento nunca pode depender
    // apenas de "não ter mais de um tenant ainda").
    if (payload.tenantId !== req.tenant.id) return false;

    req.user = { id: payload.sub, tenantId: payload.tenantId, role: payload.role, email: payload.email, name: payload.name };
    return true;
  } catch {
    return false;
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

  if (!authenticateToken(req, token)) {
    return next(new UnauthorizedError('Sessão inválida ou expirada.'));
  }
  next();
}

// Único uso: servir a foto de um paciente via <img src="...">, que não
// consegue mandar um header Authorization — aceita o token também por query
// string SÓ aqui (ver patients.routes.ts), nunca no resto da API. O corpo da
// verificação é o mesmo requireAuth de sempre, então não há enfraquecimento
// nenhum de segurança, só um segundo lugar de onde o token pode vir.
export function requireAuthFromHeaderOrQuery(req: Request, _res: Response, next: NextFunction) {
  const header = req.header('authorization');
  const headerToken = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;

  if (!authenticateToken(req, headerToken ?? queryToken)) {
    return next(new UnauthorizedError('Sessão inválida ou expirada.'));
  }
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new ForbiddenError());
    }
    next();
  };
}
