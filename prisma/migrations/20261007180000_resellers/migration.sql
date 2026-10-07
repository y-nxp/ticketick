-- CreateEnum
CREATE TYPE "CommissionKind" AS ENUM ('PERCENT', 'FIXED_PER_TICKET');

-- CreateEnum
CREATE TYPE "ReportFrequency" AS ENUM ('NONE', 'DAILY', 'WEEKLY');

-- AlterEnum
ALTER TYPE "ChargeMethod" ADD VALUE 'TERMINAL';

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'TERMINAL';

-- AlterTable
ALTER TABLE "Reseller" ADD COLUMN     "allowOnlineSales" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allowTerminalSales" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "commissionFixedCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "commissionKind" "CommissionKind" NOT NULL DEFAULT 'PERCENT',
ADD COLUMN     "lastReportAt" TIMESTAMP(3),
ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'fr',
ADD COLUMN     "notifyEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "organizerId" TEXT,
ADD COLUMN     "reportCopyOrganizer" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reportFrequency" "ReportFrequency" NOT NULL DEFAULT 'NONE';

-- CreateTable
CREATE TABLE "ResellerEvent" (
    "id" TEXT NOT NULL,
    "resellerId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "commissionKind" "CommissionKind",
    "commissionBps" INTEGER,
    "commissionFixedCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResellerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResellerEvent_eventId_idx" ON "ResellerEvent"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "ResellerEvent_resellerId_eventId_key" ON "ResellerEvent"("resellerId", "eventId");

-- CreateIndex
CREATE INDEX "Reseller_organizerId_idx" ON "Reseller"("organizerId");

-- AddForeignKey
ALTER TABLE "Reseller" ADD CONSTRAINT "Reseller_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResellerEvent" ADD CONSTRAINT "ResellerEvent_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResellerEvent" ADD CONSTRAINT "ResellerEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

