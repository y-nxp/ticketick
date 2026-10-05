-- AlterTable
ALTER TABLE "Organizer" ADD COLUMN "cardProvider" TEXT;

-- CreateTable
CREATE TABLE "OrganizerStripeAccount" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountName" TEXT,
    "secretEnc" TEXT NOT NULL,
    "live" BOOLEAN NOT NULL,
    "webhookEndpointId" TEXT,
    "webhookSecretEnc" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizerStripeAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizerStripeAccount_organizerId_key" ON "OrganizerStripeAccount"("organizerId");

-- AddForeignKey
ALTER TABLE "OrganizerStripeAccount" ADD CONSTRAINT "OrganizerStripeAccount_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
