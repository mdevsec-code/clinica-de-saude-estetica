import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import { listAuditLogs } from './audit.service';

export const auditRouter = Router();

// Só ADMIN (não RECEPÇÃO): o histórico de auditoria inclui o que a própria
// recepção fez — dar a ela acesso de leitura ao próprio log de vigilância
// não faz sentido nesse desenho de papéis (o mesmo raciocínio já aplicado
// em Usuários, outra tela restrita a dono da clínica).
auditRouter.use(requireAuth, requireRole('ADMIN'));

const AUDIT_ACTIONS = ['CREATE', 'UPDATE', 'DELETE'] as const;

const listQuerySchema = z.object({
  userId: z.string().optional(),
  entityType: z.string().optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

auditRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    const result = await listAuditLogs({ tenantId: req.tenant.id, ...query });
    res.json(result);
  }),
);
