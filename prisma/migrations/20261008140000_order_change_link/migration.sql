-- AlterTable
ALTER TABLE "OrderCharge" ADD COLUMN "replacesTicketIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "OrderChangeLink" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderChangeLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderChangeLink_tokenHash_key" ON "OrderChangeLink"("tokenHash");

-- CreateIndex
CREATE INDEX "OrderChangeLink_orderId_idx" ON "OrderChangeLink"("orderId");

-- AddForeignKey
ALTER TABLE "OrderChangeLink" ADD CONSTRAINT "OrderChangeLink_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
