-- Encaixe: atendimento marcado de propósito por cima de outro (a Noely sabe
-- do tempo dela). A trava anti-sobreposição do banco passa a ignorar encaixes;
-- os agendamentos normais e os do site continuam protegidos.
ALTER TABLE "Appointment" ADD COLUMN "fitIn" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Appointment" DROP CONSTRAINT IF EXISTS appointment_no_overlap;

-- A coluna "period" vem de prisma/manual-sql/001 (só existe onde ele rodou).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Appointment' AND column_name = 'period') THEN
    ALTER TABLE "Appointment"
      ADD CONSTRAINT appointment_no_overlap
      EXCLUDE USING gist ("tenantId" WITH =, "period" WITH &&)
      WHERE (status = 'CONFIRMED' AND NOT "fitIn");
  END IF;
END $$;
