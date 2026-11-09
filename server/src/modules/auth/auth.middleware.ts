import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { UserRole } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { ForbiddenError, UnauthorizedError } from '../../utils/errors';

interface TokenPayload {
  sub: string;
  tenantId: string;
  role: UserRole;
  email?: string;
  name?: string;
  // 'file' = token de leitura de arquivo (ver signFileToken em
  // auth.service.ts). Ausente = token de sessão normal.
  scope?: 'file';
}

type TokenKind = 'session' | 'file';

async function authenticateToken(req: Request, token: string | undefined, kind: TokenKind = 'session'): Promise<boolean> {
  if (!token) return false;

  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as TokenPayload;
  } catch {
    return false;
  }

  // Cada tipo de token só vale no seu lugar: o token de arquivo (que vai
  // na URL de <img>/links e por isso pode vazar em histórico/cache) nunca
  // autentica uma chamada normal da API, e o token de sessão nunca é
  // aceito pela URL.
  const payloadKind: TokenKind = payload.scope === 'file' ? 'file' : 'session';
  if (payloadKind !== kind) return false;

  // O token prova a que tenant o usuário pertence; a requisição já resolveu
  // um tenant (por header/subdomínio, ver tenant.middleware.ts). Se os dois
  // não baterem, é uma tentativa de usar credenciais de um tenant para agir
  // sobre dados de outro — nunca deixar passar, mesmo hoje com um único
  // tenant em produção (item 7 do escopo: isolamento nunca pode depender
  // apenas de "não ter mais de um tenant ainda").
  if (payload.tenantId !== req.tenant.id) return false;

  // A conta é conferida no banco a cada requisição, não só no login: antes,
  // desativar alguém em Usuários não encerrava a sessão dela — o token
  // continuava valendo até expirar (8h). Pelo mesmo motivo a FUNÇÃO vem do
  // banco, não do token: rebaixar de ADMIN para RECEPÇÃO vale na hora.
  const user = await prisma.user.findFirst({
    where: { id: payload.sub, tenantId: payload.tenantId },
    select: { active: true, role: true, name: true, email: true },
  });
  if (!user || !user.active) return false;

  req.user = { id: payload.sub, tenantId: payload.tenantId, role: user.role, email: user.email, name: user.name };
  return true;
}

function bearerToken(req: Request) {
  const header = req.header('authorization');
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  authenticateToken(req, bearerToken(req))
    .then((ok) => next(ok ? undefined : new UnauthorizedError('Sessão inválida ou expirada.')))
    .catch(next);
}

// Único uso: servir arquivo de paciente (foto, ficha digitalizada) via
// <img src> ou link, que não conseguem mandar header Authorization — SÓ
// estas rotas aceitam token pela query string (ver patients.routes.ts).
// Pela URL, só vale o token de ARQUIVO (escopo 'file', curta duração, ver
// signFileToken): antes era o próprio token de sessão, e uma URL vazada
// (histórico do navegador, cache, log de servidor) dava acesso total ao
// painel por horas. Pelo header, continua valendo a sessão normal.
export function requireAuthFromHeaderOrQuery(req: Request, _res: Response, next: NextFunction) {
  const headerToken = bearerToken(req);
  const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;

  const check = headerToken ? authenticateToken(req, headerToken, 'session') : authenticateToken(req, queryToken, 'file');
  check.then((ok) => next(ok ? undefined : new UnauthorizedError('Sessão inválida ou expirada.'))).catch(next);
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new ForbiddenError());
    }
    next();
  };
}
