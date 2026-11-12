-- AlterEnum
ALTER TYPE "MessageTemplateKey" ADD VALUE 'RESCHEDULE_OFFER';
ALTER TYPE "MessageTemplateKey" ADD VALUE 'RESCHEDULE_DONE';

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "rescheduleAcceptedAt" TIMESTAMPTZ(3),
ADD COLUMN     "rescheduleOfferSentAt" TIMESTAMPTZ(3),
ADD COLUMN     "rescheduleProposedStartAt" TIMESTAMPTZ(3);

-- Dados: o sábado passa a abrir às 09:00 (antes 08:00). As pacientes já
-- marcadas às 08:00 recebem a proposta de remarcação pelo WhatsApp.
UPDATE "BusinessHour" SET "opensAt" = '09:00' WHERE "weekday" = 6 AND "opensAt" = '08:00';

-- AlterTable: pausa de almoço fechada todo dia (padrão 12:00–13:00).
ALTER TABLE "TenantSettings" ADD COLUMN     "lunchEnd" TEXT DEFAULT '13:00',
ADD COLUMN     "lunchStart" TEXT DEFAULT '12:00';
