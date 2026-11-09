-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "confirmationSentAt" TIMESTAMPTZ(3),
ADD COLUMN     "reminderSentAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "welcomeSentAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "MessageTemplate" ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true;
