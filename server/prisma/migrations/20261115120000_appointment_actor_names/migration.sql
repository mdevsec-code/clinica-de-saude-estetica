-- Quem marcou (equipe) e quem desmarcou cada atendimento.
ALTER TABLE "Appointment" ADD COLUMN "createdByName" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "cancelledByName" TEXT;
