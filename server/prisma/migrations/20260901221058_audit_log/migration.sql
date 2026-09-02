-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- NOTA: o diff automático do Prisma também sugeriu "ALTER TABLE Appointment
-- DROP COLUMN period" aqui — removido de propósito, mesmo caso já documentado
-- nas migrações 20260831183724_add_finance_inventory e
-- 20260901171530_expense_status_and_bank_reconciliation. "period" é a coluna
-- gerada por SQL manual (ver prisma/manual-sql/001_appointment_no_overlap.sql)
-- que sustenta a EXCLUDE CONSTRAINT anti-double-booking; não existe no
-- schema.prisma por design, então o Prisma a vê como "coluna extra" e tenta
-- apagá-la. Apagar essa coluna derrubaria a constraint junto (CASCADE).

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "entityLabel" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "changes" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entityType_idx" ON "AuditLog"("tenantId", "entityType");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_userId_idx" ON "AuditLog"("tenantId", "userId");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
