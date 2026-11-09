import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3333),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter pelo menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  TENANT_TIMEZONE: z.string().default('America/Bahia'),
  // "true" só quando a API roda atrás de um proxy reverso (Nginx na VPS —
  // ver DEPLOY.md). Sem isso, atrás do proxy todo visitante chega com o IP
  // do próprio Nginx e o rate limit de login/agendamento passa a bloquear
  // todo mundo junto. Desligado por padrão porque, exposta direto, confiar
  // no X-Forwarded-For deixaria qualquer um forjar o próprio IP.
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  // WhatsApp Cloud API (Meta) — lembretes de retorno/aniversário. Opcionais
  // de propósito: sem essas duas variáveis, o envio simplesmente fica
  // indisponível (ver whatsapp.client.ts) em vez de a aplicação inteira
  // falhar ao subir — nem toda instalação vai ter isso configurado desde o
  // primeiro dia, e o resto do painel (lembretes na tela, agenda, fichas)
  // funciona inteiramente sem ele.
  WHATSAPP_CLOUD_API_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_API_VERSION: z.string().default('v21.0'),
  // Pasta da sessão do WhatsApp conectado por QR code (modules/whatsapp).
  // Opcional: padrão server/.whatsapp-session. Contém as credenciais da
  // sessão — fora do repositório (.gitignore) e fora de pastas públicas.
  WHATSAPP_SESSION_DIR: z.string().optional(),
  // Armazenamento de arquivo (fotos de paciente, fichas digitalizadas) —
  // opcionais pelo mesmo motivo do WhatsApp acima: sem as 4 variáveis,
  // lib/file-storage.ts cai para disco local (comportamento de sempre, bom
  // para desenvolvimento). Só ficam obrigatórias de fato em produção numa
  // hospedagem com disco efêmero (Railway, Render etc.) — ver DEPLOY.md.
  // R2 é compatível com a API S3, então o mesmo client atende os dois.
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Variáveis de ambiente inválidas:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
