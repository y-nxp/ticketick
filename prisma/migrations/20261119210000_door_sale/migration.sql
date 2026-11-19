CREATE TABLE "DoorSale" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "chargeId" TEXT,
    "provider" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "paidTickets" INTEGER NOT NULL,
    "lines" JSONB NOT NULL,
    "soldById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DoorSale_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DoorSale_chargeId_key" ON "DoorSale"("chargeId");
CREATE INDEX "DoorSale_sessionId_idx" ON "DoorSale"("sessionId");
ALTER TABLE "DoorSale" ADD CONSTRAINT "DoorSale_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "EventSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DoorSale" ADD CONSTRAINT "DoorSale_soldById_fkey" FOREIGN KEY ("soldById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
