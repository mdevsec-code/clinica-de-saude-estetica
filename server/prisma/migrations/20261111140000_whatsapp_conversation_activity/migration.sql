-- AlterTable
ALTER TABLE "WhatsappContact" ADD COLUMN     "lastActivityAt" TIMESTAMPTZ(3),
ALTER COLUMN "lastWelcomeAt" DROP NOT NULL;
