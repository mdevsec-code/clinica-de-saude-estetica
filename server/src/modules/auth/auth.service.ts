import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { UserRole } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../utils/errors';

const BCRYPT_ROUNDS = 10;

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
  // qual das duas falhou (evita enumeração de contas).
  if (!user || !user.active) {
    throw new UnauthorizedError();
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError();
  }

  const token = jwt.sign(
    { sub: user.id, tenantId: user.tenantId, role: user.role, email: user.email, name: user.name },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
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

interface UpdateUserInput {
  name: string;
  email: string;
  role: UserRole;
}

// Mesma lógica de proteção do setUserActive acima, mas para função: sem
// isso, um ADMIN sozinho poderia se rebaixar para RECEPTION sem querer e
// ficar sem acesso a esta própria tela pra reverter.
export async function updateUser(tenantId: string, userId: string, input: UpdateUserInput, requestingUserId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!user) {
    throw new NotFoundError('Usuário não encontrado.');
  }
  if (user.id === requestingUserId && user.role === 'ADMIN' && input.role !== 'ADMIN') {
    throw new ForbiddenError('Você não pode remover sua própria função de administrador.');
  }
  if (input.email !== user.email) {
    const existing = await prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email: input.email } },
    });
    if (existing) {
      throw new ConflictError('Já existe uma conta com este e-mail.');
    }
  }

  return prisma.user.update({
    where: { id: user.id },
    data: { name: input.name, email: input.email, role: input.role },
    select: userSelect,
  });
}

// Redefinição de senha pelo ADMIN — caso a recepção esqueça a própria senha
// (fluxo interno, sem e-mail de recuperação: são poucas contas e o ADMIN já
// tem acesso a este painel).
export async function resetUserPassword(tenantId: string, userId: string, password: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!user) {
    throw new NotFoundError('Usuário não encontrado.');
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
}
