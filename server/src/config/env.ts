import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3333),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET deve ter pelo menos 16 caracteres'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  TENANT_TIMEZONE: z.string().default('America/Bahia'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Variáveis de ambiente inválidas:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
