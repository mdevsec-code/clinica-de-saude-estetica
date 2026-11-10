-- Comanda: valor cobrado e forma de pagamento por atendimento.
ALTER TABLE "Appointment" ADD COLUMN "chargedCents" INTEGER;
ALTER TABLE "Appointment" ADD COLUMN "paymentMethod" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "paymentNote" TEXT;
