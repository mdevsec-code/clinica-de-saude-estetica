-- Lista de transmissão do WhatsApp e contatos salvos no celular.
CREATE TABLE "WhatsappAddressContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "WhatsappAddressContact_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhatsappAddressContact_tenantId_phone_key" ON "WhatsappAddressContact"("tenantId", "phone");
ALTER TABLE "WhatsappAddressContact" ADD CONSTRAINT "WhatsappAddressContact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "total" INTEGER NOT NULL,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "createdByName" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),
    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Broadcast_tenantId_status_idx" ON "Broadcast"("tenantId", "status");
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "BroadcastRecipient" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    CONSTRAINT "BroadcastRecipient_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BroadcastRecipient_broadcastId_status_idx" ON "BroadcastRecipient"("broadcastId", "status");
CREATE INDEX "BroadcastRecipient_sentAt_idx" ON "BroadcastRecipient"("sentAt");
ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;
