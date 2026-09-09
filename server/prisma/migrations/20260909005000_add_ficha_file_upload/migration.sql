-- Escrita manualmente (não via `prisma migrate dev`) porque o schema atual
-- já tem drift esperado em relação à migration history: a coluna "period" e
-- a EXCLUDE CONSTRAINT de Appointment vêm de prisma/manual-sql/001 (fora do
-- fluxo padrão do Prisma, ver comentário lá), e `migrate dev` insiste em
-- resetar o banco ao detectar esse drift. Aplicada com
-- `npx prisma db execute` e depois marcada como resolvida com
-- `npx prisma migrate resolve --applied` (mesmo padrão já documentado no
-- README para a constraint manual).
ALTER TABLE "PatientFicha" ALTER COLUMN "fields" SET DEFAULT '[]';
ALTER TABLE "PatientFicha" ADD COLUMN "fileStorageKey" TEXT;
ALTER TABLE "PatientFicha" ADD COLUMN "fileMimeType" TEXT;
ALTER TABLE "PatientFicha" ADD COLUMN "fileName" TEXT;
