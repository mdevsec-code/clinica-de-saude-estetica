-- Uma paciente por celular. "phoneKey" é calculada pelo próprio banco a
-- partir do WhatsApp — a mesma regra de phoneKey() em whatsapp-connection.ts:
-- só dígitos, sem o 55 do país, DDD + 8 últimos dígitos (o mesmo número com
-- ou sem o 9º dígito, com ou sem máscara, dá a mesma chave). O índice único
-- impede um segundo cadastro do mesmo número, venha de onde vier.
-- Aplicar à mão, DEPOIS de não sobrar duplicata (merge-duplicate-customers.js
-- sem --apply mostra "0 pacientes com duplicata"):
--   npx prisma db execute --file prisma/manual-sql/002_customer_unique_phone.sql --schema prisma/schema.prisma
-- (com
-- duplicatas existentes esta migration falha e não altera nada).
-- Fora do schema.prisma de propósito (Prisma não declara coluna gerada),
-- mesmo caso do EXCLUDE de prisma/manual-sql/001.
ALTER TABLE "Customer" ADD COLUMN "phoneKey" TEXT GENERATED ALWAYS AS (
  left(
    CASE WHEN regexp_replace("whatsapp", '\D', '', 'g') LIKE '55%'
      THEN substr(regexp_replace("whatsapp", '\D', '', 'g'), 3)
      ELSE regexp_replace("whatsapp", '\D', '', 'g') END, 2)
  || right(regexp_replace("whatsapp", '\D', '', 'g'), 8)
) STORED;

CREATE UNIQUE INDEX "Customer_tenantId_phoneKey_key" ON "Customer" ("tenantId", "phoneKey")
  WHERE length(regexp_replace("whatsapp", '\D', '', 'g')) >= 10;
