-- Execute este script UMA VEZ, depois da primeira migration do Prisma:
--   npx prisma db execute --file prisma/manual-sql/001_appointment_no_overlap.sql --schema prisma/schema.prisma
--
-- Por que isso existe fora do schema.prisma:
-- O Prisma Migrate não tem suporte nativo a EXCLUDE CONSTRAINT do PostgreSQL.
-- Esta é a garantia definitiva contra double-booking (dois agendamentos confirmados
-- com horários sobrepostos para o mesmo tenant), aplicada no nível mais baixo possível:
-- o próprio banco rejeita a escrita, independentemente de bugs ou race conditions
-- na camada de aplicação. A checagem em transação feita no backend (ver
-- appointments.service.ts) é a primeira linha de defesa (dá uma mensagem amigável);
-- esta constraint é a última linha de defesa, a que realmente não pode falhar.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Exige que startAt/endAt sejam timestamptz de verdade (ver schema.prisma):
-- tstzrange() aplicado direto a timestamptz é imutável; se as colunas fossem
-- timestamp sem fuso, a conversão implícita dependeria da sessão e nunca
-- poderia ser imutável (erro real que apareceu ao configurar isso pela
-- primeira vez, antes das colunas virarem @db.Timestamptz).
ALTER TABLE "Appointment"
  ADD COLUMN IF NOT EXISTS "period" tstzrange
  GENERATED ALWAYS AS (tstzrange("startAt", "endAt", '[)')) STORED;

ALTER TABLE "Appointment"
  ADD CONSTRAINT appointment_no_overlap
  EXCLUDE USING gist (
    "tenantId" WITH =,
    "period" WITH &&
  )
  WHERE (status = 'CONFIRMED');
