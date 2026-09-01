-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('PRODUTOS', 'EQUIPAMENTOS', 'ALUGUEL', 'MARKETING', 'SALARIOS', 'OUTROS');

-- NOTA: o diff automático do Prisma também sugeriu "ALTER TABLE Appointment
-- DROP COLUMN period" aqui — removido de propósito. "period" é a coluna
-- gerada por SQL manual (ver prisma/manual-sql/001_appointment_no_overlap.sql)
-- que sustenta a EXCLUDE CONSTRAINT anti-double-booking; ela não existe no
-- schema.prisma por design (Prisma Migrate não suporta EXCLUDE CONSTRAINT
-- nativamente), então o Prisma a vê como "coluna extra" e tenta apagá-la.
-- Apagar essa coluna derrubaria a constraint junto (CASCADE) e desligaria a
-- garantia de banco contra dois agendamentos confirmados sobrepostos.

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL DEFAULT 'OUTROS',
    "amountCents" INTEGER NOT NULL,
    "paidAt" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'un',
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "minQuantity" INTEGER NOT NULL DEFAULT 0,
    "costCents" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Expense_tenantId_paidAt_idx" ON "Expense"("tenantId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_tenantId_name_key" ON "InventoryItem"("tenantId", "name");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
