import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler';
import { loginRateLimiter } from '../../middleware/rate-limit';
import { createUser, FILE_TOKEN_TTL_SECONDS, listUsers, login, setUserActive, signFileToken } from './auth.service';
import { requireAuth, requireRole } from './auth.middleware';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

authRouter.post(
  '/login',
  loginRateLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const result = await login({ tenantId: req.tenant.id, email, password });
    res.json(result);
  }),
);

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Token de arquivo (ver signFileToken): o painel pede um antes de exibir
// fotos/fichas de paciente e renova antes de expirar.
authRouter.get('/file-token', requireAuth, (req, res) => {
  res.json({ token: signFileToken(req.user!), expiresInSeconds: FILE_TOKEN_TTL_SECONDS });
});

// --- Gestão de contas — só ADMIN cria login para a recepção (item pendente
// da Fase 1: até aqui só era possível via seed manual no banco). ---
const usersRouter = Router();
usersRouter.use(requireAuth, requireRole('ADMIN'));

const createUserSchema = z.object({
  name: z.string().min(2, 'Informe o nome completo.'),
  email: z.string().email(),
  // Teto de 72: o bcrypt ignora tudo depois do 72º byte — uma senha maior
  // seria aceita, mas só o começo dela valeria, sem a pessoa saber.
  password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.').max(72, 'A senha pode ter no máximo 72 caracteres.'),
  role: z.enum(['ADMIN', 'RECEPTION']),
});

usersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const users = await listUsers(req.tenant.id);
    res.json({ users });
  }),
);

usersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createUserSchema.parse(req.body);
    const user = await createUser(req.tenant.id, input);
    res.status(201).json({ user });
  }),
);

const statusSchema = z.object({ active: z.boolean() });

usersRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { active } = statusSchema.parse(req.body);
    const user = await setUserActive(req.tenant.id, req.params.id, active, req.user!.id);
    res.json({ user });
  }),
);

authRouter.use('/users', usersRouter);
