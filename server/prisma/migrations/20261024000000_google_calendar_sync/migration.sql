-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "googleEventId" TEXT;

-- AlterTable
ALTER TABLE "BlockedTime" ADD COLUMN     "externalId" TEXT;
