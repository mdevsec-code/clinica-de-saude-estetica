import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { UserRole } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../utils/errors';

const BCRYPT_ROUNDS = 10;

// Hash de uma senha aleatória, gerado uma vez por processo — só para o
// login gastar o mesmo tempo de bcrypt quando a conta não existe.
const DUMMY_HASH = bcrypt.hashSync(randomBytes(16).toString('hex'), BCRYPT_ROUNDS);

// Token de leitura de ARQUIVO (foto de paciente, ficha digitalizada): vai
// na URL de <img>/links, que não mandam header Authorization, e por isso
// pode parar em histórico, cache ou log. Escopo 'file' (o requireAuth
// normal o recusa — ver auth.middleware.ts), sem nome/e-mail no payload e
// curta duração: uma URL vazada só serve para ver arquivos, por pouco tempo.
export const FILE_TOKEN_TTL_SECONDS = 60 * 60;

export function signFileToken(user: { id: string; tenantId: string; role: UserRole }) {
  return jwt.sign({ sub: user.id, tenantId: user.tenantId, role: user.role, scope: 'file' }, env.JWT_SECRET, {
    expiresIn: FILE_TOKEN_TTL_SECONDS,
    algorithm: 'HS256',
  });
}

interface LoginInput {
  tenantId: string;
  email: string;
  password: string;
}

export async function login({ tenantId, email, password }: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId, email } },
  });

  // Mensagem idêntica para "usuário não existe" e "senha errada" — não vazar
  // qual das duas falhou (evita enumeração de contas). O bcrypt roda SEMPRE,
  // contra um hash descartável quando a conta não existe: sem isso, e-mail
  // inexistente respondia na hora e e-mail existente levava o tempo do
  // bcrypt (~100ms) — a diferença de TEMPO entregava quais e-mails têm conta
  // mesmo com a mensagem igual.
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.active || !valid) {
    throw new UnauthorizedError();
  }

  const token = jwt.sign(
    { sub: user.id, tenantId: user.tenantId, role: user.role, email: user.email, name: user.name },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'], algorithm: 'HS256' },
  );

  return {
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  };
}

const userSelect = { id: true, name: true, email: true, role: true, active: true, createdAt: true } as const;

// --- Administração de contas (só ADMIN — item pendente da Fase 1: até aqui a
// única forma de dar acesso à recepção era rodar o seed manualmente). ---
export async function listUsers(tenantId: string) {
  return prisma.user.findMany({ where: { tenantId }, select: userSelect, orderBy: { createdAt: 'asc' } });
}

interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

export async function createUser(tenantId: string, input: CreateUserInput) {
  const existing = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId, email: input.email } },
  });
  if (existing) {
    throw new ConflictError('Já existe uma conta com este e-mail.');
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: { tenantId, name: input.name, email: input.email, passwordHash, role: input.role },
    select: userSelect,
  });
  return user;
}

// requestingUserId: nunca deixa a única conta ADMIN se autodesativar por
// engano e ficar sem ninguém capaz de reativar contas depois.
export async function setUserActive(tenantId: string, userId: string, active: boolean, requestingUserId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!user) {
    throw new NotFoundError('Usuário não encontrado.');
  }
  if (!active && user.id === requestingUserId) {
    throw new ForbiddenError('Você não pode desativar a própria conta.');
  }

  return prisma.user.update({ where: { id: user.id }, data: { active }, select: userSelect });
}
