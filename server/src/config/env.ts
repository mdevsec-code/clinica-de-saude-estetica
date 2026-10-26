import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3333),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter pelo menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  // Quantos proxies reversos ficam na frente da API (ex.: 1 com Nginx na
  // VPS). Sem isso, atrás de um proxy todo req.ip vira 127.0.0.1 e os rate
  // limiters por IP (ver middleware/rate-limit.ts) passam a contar todos os
  // visitantes juntos. 0 = acesso direto, sem proxy (desenvolvimento).
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
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
  // Google Agenda da clínica (ver modules/google-calendar) — opcionais pelo
  // mesmo motivo do WhatsApp: sem as duas primeiras, a integração fica
  // desligada e o agendamento funciona igual. Autentica por conta de serviço
  // (arquivo JSON da chave, baixado do Google Cloud); a agenda precisa estar
  // compartilhada com o e-mail dessa conta com permissão de "Fazer
  // alterações nos eventos".
  GOOGLE_CALENDAR_ID: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_KEY_FILE: z.string().optional(),
  GOOGLE_CALENDAR_SYNC_INTERVAL_MIN: z.coerce.number().int().min(1).default(5),
  // Armazenamento de arquivo (fotos de paciente, fichas digitalizadas) —
  // opcionais pelo mesmo motivo do WhatsApp acima: sem estas 5 variáveis,
  // lib/file-storage.ts cai para disco local (comportamento de sempre, bom
  // para desenvolvimento). Só ficam obrigatórias de fato em produção numa
  // hospedagem com disco efêmero (Railway, Render etc.) — ver DEPLOY.md.
  // Genérico (S3_*, não SUPABASE_*/R2_*) de propósito: qualquer storage
  // compatível com a API S3 funciona sem trocar código — Supabase Storage
  // (recomendado, ver DEPLOY.md) e Cloudflare R2 já foram usados aqui, só
  // muda o endpoint/região/credenciais.
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET_NAME: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Variáveis de ambiente inválidas:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
