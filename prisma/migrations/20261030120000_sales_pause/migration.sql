-- Vente suspendue : la fiche reste en ligne et recueille les adresses à prévenir.

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "salesPaused" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SalesAlert" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "SalesAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesAlert_eventId_email_key" ON "SalesAlert"("eventId", "email");

-- CreateIndex
CREATE INDEX "SalesAlert_eventId_notifiedAt_idx" ON "SalesAlert"("eventId", "notifiedAt");

-- AddForeignKey
ALTER TABLE "SalesAlert" ADD CONSTRAINT "SalesAlert_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
