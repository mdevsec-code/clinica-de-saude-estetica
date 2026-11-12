-- Taxa da maquininha (centésimos de %) e taxa descontada por atendimento.
ALTER TABLE "TenantSettings" ADD COLUMN "cardFeeDebitBps" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TenantSettings" ADD COLUMN "cardFeeCreditBps" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TenantSettings" ADD COLUMN "cardFeeInstallmentBps" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Appointment" ADD COLUMN "feeCents" INTEGER;
