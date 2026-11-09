-- AlterEnum
BEGIN;
CREATE TYPE "MessageTemplateKey_new" AS ENUM ('WELCOME', 'CONFIRMATION', 'CONFIRMATION_THANKS', 'REMINDER_DAY_BEFORE', 'REMINDER_2H');
ALTER TABLE "MessageTemplate" ALTER COLUMN "key" TYPE "MessageTemplateKey_new" USING ("key"::text::"MessageTemplateKey_new");
ALTER TYPE "MessageTemplateKey" RENAME TO "MessageTemplateKey_old";
ALTER TYPE "MessageTemplateKey_new" RENAME TO "MessageTemplateKey";
DROP TYPE "public"."MessageTemplateKey_old";
COMMIT;

-- AlterTable
ALTER TABLE "Appointment" DROP COLUMN "reminderSentAt",
ADD COLUMN     "clientConfirmedAt" TIMESTAMPTZ(3),
ADD COLUMN     "reminder2hSentAt" TIMESTAMPTZ(3),
ADD COLUMN     "reminderDayBeforeSentAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "welcomeSentAt";

-- CreateTable
CREATE TABLE "WhatsappContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phoneKey" TEXT NOT NULL,
    "lastWelcomeAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WhatsappContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappContact_tenantId_phoneKey_key" ON "WhatsappContact"("tenantId", "phoneKey");

-- AddForeignKey
ALTER TABLE "WhatsappContact" ADD CONSTRAINT "WhatsappContact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

