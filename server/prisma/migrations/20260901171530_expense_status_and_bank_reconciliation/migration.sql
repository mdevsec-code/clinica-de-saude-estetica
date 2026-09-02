-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('PENDING', 'PAID');

-- CreateEnum
CREATE TYPE "BankTransactionStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'IGNORED');

-- NOTA: o diff automático do Prisma também sugeriu "ALTER TABLE Appointment
-- DROP COLUMN period" aqui — removido de propósito, mesmo caso já documentado
-- na migração 20260831183724_add_finance_inventory. "period" é a coluna
-- gerada por SQL manual (ver prisma/manual-sql/001_appointment_no_overlap.sql)
-- que sustenta a EXCLUDE CONSTRAINT anti-double-booking; não existe no
-- schema.prisma por design, então o Prisma a vê como "coluna extra" e tenta
-- apagá-la. Apagar essa coluna derrubaria a constraint junto (CASCADE).

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "dueAt" DATE,
ADD COLUMN     "status" "ExpenseStatus" NOT NULL DEFAULT 'PAID',
ALTER COLUMN "paidAt" DROP NOT NULL;

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fitId" TEXT NOT NULL,
    "postedAt" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "memo" TEXT,
    "status" "BankTransactionStatus" NOT NULL DEFAULT 'UNMATCHED',
    "matchedExpenseId" TEXT,
    "importedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankTransaction_tenantId_status_idx" ON "BankTransaction"("tenantId", "status");

-- CreateIndex
CREATE INDEX "BankTransaction_tenantId_postedAt_idx" ON "BankTransaction"("tenantId", "postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_tenantId_fitId_key" ON "BankTransaction"("tenantId", "fitId");

-- CreateIndex
CREATE INDEX "Expense_tenantId_dueAt_idx" ON "Expense"("tenantId", "dueAt");

-- CreateIndex
CREATE INDEX "Expense_tenantId_status_idx" ON "Expense"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_matchedExpenseId_fkey" FOREIGN KEY ("matchedExpenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
