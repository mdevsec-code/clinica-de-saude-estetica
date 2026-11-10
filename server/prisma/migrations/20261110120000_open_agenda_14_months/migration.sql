-- Agenda aberta por ~14 meses (pedido da clínica: até dezembro de 2027).
ALTER TABLE "TenantSettings" ALTER COLUMN "maxAdvanceDays" SET DEFAULT 420;
UPDATE "TenantSettings" SET "maxAdvanceDays" = 420 WHERE "maxAdvanceDays" < 420;
