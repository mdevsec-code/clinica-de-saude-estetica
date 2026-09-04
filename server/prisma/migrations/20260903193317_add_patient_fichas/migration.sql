-- CreateTable
CREATE TABLE "PatientFicha" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PatientFicha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientFicha_tenantId_customerId_idx" ON "PatientFicha"("tenantId", "customerId");

-- AddForeignKey
ALTER TABLE "PatientFicha" ADD CONSTRAINT "PatientFicha_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientFicha" ADD CONSTRAINT "PatientFicha_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

