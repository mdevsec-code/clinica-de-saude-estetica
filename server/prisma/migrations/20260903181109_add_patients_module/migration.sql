-- CreateEnum
CREATE TYPE "ReturnReminderStatus" AS ENUM ('PENDING', 'NOTIFIED', 'DONE', 'DISMISSED');

-- CreateEnum
CREATE TYPE "PatientPhotoCategory" AS ENUM ('BEFORE', 'AFTER', 'EVOLUTION', 'OTHER');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'VIEW';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "profilePhotoUrl" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "returnOffsetDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- CreateTable
CREATE TABLE "ProcedureRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "performedAt" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcedureRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnReminder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "procedureRecordId" TEXT NOT NULL,
    "offsetDays" INTEGER NOT NULL,
    "dueAt" DATE NOT NULL,
    "status" "ReturnReminderStatus" NOT NULL DEFAULT 'PENDING',
    "notifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReturnReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientPhoto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "procedureRecordId" TEXT,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "category" "PatientPhotoCategory" NOT NULL DEFAULT 'OTHER',
    "notes" TEXT,
    "takenAt" DATE NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcedureRecord_appointmentId_key" ON "ProcedureRecord"("appointmentId");

-- CreateIndex
CREATE INDEX "ProcedureRecord_tenantId_customerId_idx" ON "ProcedureRecord"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "ProcedureRecord_tenantId_performedAt_idx" ON "ProcedureRecord"("tenantId", "performedAt");

-- CreateIndex
CREATE INDEX "ReturnReminder_tenantId_dueAt_idx" ON "ReturnReminder"("tenantId", "dueAt");

-- CreateIndex
CREATE INDEX "ReturnReminder_tenantId_status_idx" ON "ReturnReminder"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ReturnReminder_tenantId_customerId_idx" ON "ReturnReminder"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "PatientPhoto_tenantId_customerId_idx" ON "PatientPhoto"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "Customer_tenantId_birthDate_idx" ON "Customer"("tenantId", "birthDate");

-- AddForeignKey
ALTER TABLE "ProcedureRecord" ADD CONSTRAINT "ProcedureRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedureRecord" ADD CONSTRAINT "ProcedureRecord_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedureRecord" ADD CONSTRAINT "ProcedureRecord_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedureRecord" ADD CONSTRAINT "ProcedureRecord_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnReminder" ADD CONSTRAINT "ReturnReminder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnReminder" ADD CONSTRAINT "ReturnReminder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnReminder" ADD CONSTRAINT "ReturnReminder_procedureRecordId_fkey" FOREIGN KEY ("procedureRecordId") REFERENCES "ProcedureRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPhoto" ADD CONSTRAINT "PatientPhoto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPhoto" ADD CONSTRAINT "PatientPhoto_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPhoto" ADD CONSTRAINT "PatientPhoto_procedureRecordId_fkey" FOREIGN KEY ("procedureRecordId") REFERENCES "ProcedureRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

