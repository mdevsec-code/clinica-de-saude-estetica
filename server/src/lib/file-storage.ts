import { randomUUID } from 'node:crypto';
import { mkdir, readFile as readFileFs, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env';

// Fotos de paciente e fichas digitalizadas NUNCA ficam em web/public (aquilo
// é asset estático de build, versionado no git) nem atrás de um
// express.static público — são dado sensível (LGPD), servidas por uma rota
// autenticada que busca o arquivo sob demanda (ver patients.routes.ts).
//
// Duas implementações por trás da mesma storageKey (um caminho relativo tipo
// "patients/<tenantId>/<customerId>/<uuid>.jpg", nunca um caminho absoluto —
// portabilidade entre ambientes/máquinas/provedores):
//   - Disco local (padrão): usado em desenvolvimento. server/uploads/, fora
//     do diretório versionado por padrão, .gitignore cobre "uploads/".
//   - Storage S3-compatível (quando S3_ENDPOINT está configurado — ver
//     config/env.ts): obrigatório em produção numa hospedagem com disco
//     efêmero (Railway, Render etc.), onde qualquer arquivo salvo em disco
//     desaparece no próximo deploy. Genérico de propósito — endpoint/região
//     configuráveis, não hardcoded pra um provedor específico — atende
//     Supabase Storage (recomendado, ver DEPLOY.md), Cloudflare R2 ou
//     qualquer outro compatível com a API S3, sem trocar código aqui.
const UPLOADS_ROOT = path.resolve(__dirname, '../../uploads');

const s3Client = env.S3_ENDPOINT
  ? new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      },
    })
  : null;

function assertSafeKey(storageKey: string) {
  // storageKey é sempre gerado por esta própria lib (nunca vem direto de
  // input do usuário) — mesmo assim, confirma que o caminho resolvido
  // continua dentro de UPLOADS_ROOT antes de ler/apagar do disco, como
  // segunda camada contra path traversal caso esse invariante seja quebrado
  // no futuro. Não se aplica ao caminho S3 (não há sistema de arquivos ali).
  const resolved = path.resolve(UPLOADS_ROOT, storageKey);
  if (!resolved.startsWith(UPLOADS_ROOT + path.sep)) {
    throw new Error('Caminho de arquivo inválido.');
  }
  return resolved;
}

async function writeStoredFile(storageKey: string, mimeType: string, buffer: Buffer): Promise<void> {
  if (s3Client) {
    await s3Client.send(
      new PutObjectCommand({ Bucket: env.S3_BUCKET_NAME, Key: storageKey, Body: buffer, ContentType: mimeType }),
    );
    return;
  }
  const resolved = assertSafeKey(storageKey);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, buffer);
}

async function readStoredFile(storageKey: string): Promise<Buffer> {
  if (s3Client) {
    const result = await s3Client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET_NAME, Key: storageKey }));
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) throw new Error('Arquivo vazio ou não encontrado no armazenamento.');
    return Buffer.from(bytes);
  }
  return readFileFs(assertSafeKey(storageKey));
}

async function deleteStoredFile(storageKey: string): Promise<void> {
  if (s3Client) {
    await s3Client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET_NAME, Key: storageKey })).catch(() => undefined);
    return;
  }
  await unlink(assertSafeKey(storageKey)).catch(() => undefined);
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function isSupportedImageMime(mimeType: string): boolean {
  return mimeType in MIME_EXTENSIONS;
}

// Fichas digitalizadas (upload de PDF/foto de um formulário já preenchido em
// papel) aceitam PDF além dos formatos de imagem acima — diferente de foto
// de paciente, que é sempre imagem.
const FICHA_FILE_MIME_EXTENSIONS: Record<string, string> = {
  ...MIME_EXTENSIONS,
  'application/pdf': 'pdf',
};

export function isSupportedFichaFileMime(mimeType: string): boolean {
  return mimeType in FICHA_FILE_MIME_EXTENSIONS;
}

export async function savePatientPhoto(tenantId: string, customerId: string, mimeType: string, base64Data: string): Promise<string> {
  const ext = MIME_EXTENSIONS[mimeType];
  if (!ext) {
    throw new Error(`Tipo de imagem não suportado: ${mimeType}`);
  }
  const storageKey = path.posix.join('patients', tenantId, customerId, `${randomUUID()}.${ext}`);
  await writeStoredFile(storageKey, mimeType, Buffer.from(base64Data, 'base64'));
  return storageKey;
}

export function readPatientPhoto(storageKey: string): Promise<Buffer> {
  return readStoredFile(storageKey);
}

export function deletePatientPhoto(storageKey: string): Promise<void> {
  return deleteStoredFile(storageKey);
}

// Mesmo tratamento de fotos, em subpasta própria — ficha digitalizada
// (ver fichas.service.ts) não é a mesma coisa que foto de evolução.
export async function saveFichaFile(tenantId: string, customerId: string, mimeType: string, base64Data: string): Promise<string> {
  const ext = FICHA_FILE_MIME_EXTENSIONS[mimeType];
  if (!ext) {
    throw new Error(`Tipo de arquivo não suportado: ${mimeType}`);
  }
  const storageKey = path.posix.join('patients', tenantId, customerId, 'fichas', `${randomUUID()}.${ext}`);
  await writeStoredFile(storageKey, mimeType, Buffer.from(base64Data, 'base64'));
  return storageKey;
}

export function readFichaFile(storageKey: string): Promise<Buffer> {
  return readStoredFile(storageKey);
}

export function deleteFichaFile(storageKey: string): Promise<void> {
  return deleteStoredFile(storageKey);
}
