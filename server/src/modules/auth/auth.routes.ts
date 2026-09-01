import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler';
import { loginRateLimiter } from '../../middleware/rate-limit';
import { createUser, listUsers, login, setUserActive } from './auth.service';
import { requireAuth, requireRole } from './auth.middleware';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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

// --- Gestão de contas — só ADMIN cria login para a recepção (item pendente
// da Fase 1: até aqui só era possível via seed manual no banco). ---
const usersRouter = Router();
usersRouter.use(requireAuth, requireRole('ADMIN'));

const createUserSchema = z.object({
  name: z.string().min(2, 'Informe o nome completo.'),
  email: z.string().email(),
  password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.'),
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
