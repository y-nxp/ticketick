-- CreateEnum
CREATE TYPE "SeatStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'BLOCKED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMethod" ADD VALUE 'PAYPAL';
ALTER TYPE "PaymentMethod" ADD VALUE 'FREE';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'ORGANIZER_VIEWER';

-- DropForeignKey
ALTER TABLE "SeatMap" DROP CONSTRAINT "SeatMap_sessionId_fkey";


-- AlterTable
ALTER TABLE "Discount" ADD COLUMN     "minDistinctSessions" INTEGER,
ADD COLUMN     "organizerId" TEXT,
ADD COLUMN     "venueId" TEXT;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "acceptPaypal" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "EventSession" ADD COLUMN     "seatPlanId" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "seatKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "attendeeBirthDate" DATE,
ADD COLUMN     "seatKey" TEXT;

-- AlterTable
ALTER TABLE "TicketType" ADD COLUMN     "maxAgeYears" INTEGER,
ADD COLUMN     "requiresAttendee" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "seatZones" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "statsOrganizerId" TEXT;

-- DropTable
DROP TABLE "SeatMap";

-- CreateTable
CREATE TABLE "OrganizerPaypalAccount" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "payeeEmail" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "secretEnc" TEXT NOT NULL,
    "live" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizerPaypalAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatPlan" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "layout" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeatPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionSeat" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "seatKey" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "status" "SeatStatus" NOT NULL DEFAULT 'AVAILABLE',
    "orderId" TEXT,
    "blockNote" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionSeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizerPaypalAccount_organizerId_key" ON "OrganizerPaypalAccount"("organizerId");

-- CreateIndex
CREATE UNIQUE INDEX "SeatPlan_slug_key" ON "SeatPlan"("slug");

-- CreateIndex
CREATE INDEX "SeatPlan_venueId_idx" ON "SeatPlan"("venueId");

-- CreateIndex
CREATE INDEX "SessionSeat_sessionId_status_idx" ON "SessionSeat"("sessionId", "status");

-- CreateIndex
CREATE INDEX "SessionSeat_orderId_idx" ON "SessionSeat"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionSeat_sessionId_seatKey_key" ON "SessionSeat"("sessionId", "seatKey");

-- CreateIndex
CREATE INDEX "Discount_organizerId_idx" ON "Discount"("organizerId");

-- CreateIndex
CREATE INDEX "User_statsOrganizerId_idx" ON "User"("statsOrganizerId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_statsOrganizerId_fkey" FOREIGN KEY ("statsOrganizerId") REFERENCES "Organizer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizerPaypalAccount" ADD CONSTRAINT "OrganizerPaypalAccount_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSession" ADD CONSTRAINT "EventSession_seatPlanId_fkey" FOREIGN KEY ("seatPlanId") REFERENCES "SeatPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatPlan" ADD CONSTRAINT "SeatPlan_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSeat" ADD CONSTRAINT "SessionSeat_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "EventSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSeat" ADD CONSTRAINT "SessionSeat_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discount" ADD CONSTRAINT "Discount_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discount" ADD CONSTRAINT "Discount_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

