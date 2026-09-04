import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Fotos de paciente NUNCA ficam em web/public (aquilo é asset estático de
// build, versionado no git) nem atrás de um express.static público — são
// dado sensível (LGPD), servidas por uma rota autenticada que lê o arquivo
// do disco sob demanda (ver patients.routes.ts). UPLOADS_ROOT fica fora do
// diretório do projeto versionado por padrão (server/uploads), mas dentro
// dele nesse ambiente de dev — .gitignore cobre "uploads/" (ver abaixo).
const UPLOADS_ROOT = path.resolve(__dirname, '../../uploads');

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function isSupportedImageMime(mimeType: string): boolean {
  return mimeType in MIME_EXTENSIONS;
}

// storageKey é relativo a UPLOADS_ROOT e é o valor persistido em
// PatientPhoto.storageKey — nunca o caminho absoluto (portabilidade entre
// ambientes/máquinas).
export async function savePatientPhoto(tenantId: string, customerId: string, mimeType: string, base64Data: string): Promise<string> {
  const ext = MIME_EXTENSIONS[mimeType];
  if (!ext) {
    throw new Error(`Tipo de imagem não suportado: ${mimeType}`);
  }

  const dir = path.join(UPLOADS_ROOT, 'patients', tenantId, customerId);
  await mkdir(dir, { recursive: true });

  const filename = `${randomUUID()}.${ext}`;
  const buffer = Buffer.from(base64Data, 'base64');
  await writeFile(path.join(dir, filename), buffer);

  return path.posix.join('patients', tenantId, customerId, filename);
}

export async function readPatientPhoto(storageKey: string): Promise<Buffer> {
  // storageKey é sempre gerado por savePatientPhoto (nunca vem direto de
  // input do usuário) — mesmo assim, normaliza e confirma que o resultado
  // continua dentro de UPLOADS_ROOT antes de ler, como segunda camada
  // contra path traversal caso esse invariante seja quebrado no futuro.
  const resolved = path.resolve(UPLOADS_ROOT, storageKey);
  if (!resolved.startsWith(UPLOADS_ROOT + path.sep)) {
    throw new Error('Caminho de arquivo inválido.');
  }
  return readFile(resolved);
}

export async function deletePatientPhoto(storageKey: string): Promise<void> {
  const resolved = path.resolve(UPLOADS_ROOT, storageKey);
  if (!resolved.startsWith(UPLOADS_ROOT + path.sep)) return;
  await unlink(resolved).catch(() => undefined);
}
