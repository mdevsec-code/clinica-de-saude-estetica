import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3333),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter pelo menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  TENANT_TIMEZONE: z.string().default('America/Bahia'),
  // WhatsApp Cloud API (Meta) — lembretes de retorno/aniversário. Opcionais
  // de propósito: sem essas duas variáveis, o envio simplesmente fica
  // indisponível (ver whatsapp.client.ts) em vez de a aplicação inteira
  // falhar ao subir — nem toda instalação vai ter isso configurado desde o
  // primeiro dia, e o resto do painel (lembretes na tela, agenda, fichas)
  // funciona inteiramente sem ele.
  WHATSAPP_CLOUD_API_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_API_VERSION: z.string().default('v21.0'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Variáveis de ambiente inválidas:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
