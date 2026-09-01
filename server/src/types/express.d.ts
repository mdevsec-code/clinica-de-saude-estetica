import type { Tenant, UserRole } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      tenant: Tenant;
      user?: {
        id: string;
        tenantId: string;
        role: UserRole;
        email: string;
      };
    }
  }
}

export {};
