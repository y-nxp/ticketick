-- CreateEnum
CREATE TYPE "ChargeKind" AS ENUM ('PAYMENT', 'REFUND');

-- CreateEnum
CREATE TYPE "ChargeMethod" AS ENUM ('CASH', 'LINK', 'DOOR', 'CREDIT_NOTE', 'PROVIDER');

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('OPEN', 'DONE', 'EXPIRED', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "OrderCharge" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "kind" "ChargeKind" NOT NULL,
    "method" "ChargeMethod" NOT NULL,
    "status" "ChargeStatus" NOT NULL DEFAULT 'OPEN',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CHF',
    "dueAt" TIMESTAMP(3),
    "tokenHash" TEXT,
    "provider" TEXT,
    "providerRef" TEXT,
    "ticketIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fromInvites" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "OrderCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderCharge_number_key" ON "OrderCharge"("number");

-- CreateIndex
CREATE UNIQUE INDEX "OrderCharge_tokenHash_key" ON "OrderCharge"("tokenHash");

-- CreateIndex
CREATE INDEX "OrderCharge_orderId_idx" ON "OrderCharge"("orderId");

-- CreateIndex
CREATE INDEX "OrderCharge_status_dueAt_idx" ON "OrderCharge"("status", "dueAt");

-- CreateIndex
CREATE INDEX "OrderCharge_provider_providerRef_idx" ON "OrderCharge"("provider", "providerRef");

-- AddForeignKey
ALTER TABLE "OrderCharge" ADD CONSTRAINT "OrderCharge_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
