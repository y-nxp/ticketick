-- AlterTable
ALTER TABLE "Organizer" ADD COLUMN     "bankBeneficiary" TEXT,
ADD COLUMN     "bankIban" TEXT;

-- CreateTable
CREATE TABLE "OrganizerPostfinanceAccount" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "spaceId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "secretEnc" TEXT NOT NULL,
    "spaceViewId" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizerPostfinanceAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizerPostfinanceAccount_organizerId_key" ON "OrganizerPostfinanceAccount"("organizerId");

-- AddForeignKey
ALTER TABLE "OrganizerPostfinanceAccount" ADD CONSTRAINT "OrganizerPostfinanceAccount_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
