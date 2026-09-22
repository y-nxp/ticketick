-- Tarif payant qui débloque les places gratuites. NULL : tous les payants de
-- la séance comptent, comportement d'avant cette migration.

ALTER TABLE "TicketType" ADD COLUMN "companionOfId" TEXT;

CREATE INDEX "TicketType_companionOfId_idx" ON "TicketType"("companionOfId");

ALTER TABLE "TicketType"
  ADD CONSTRAINT "TicketType_companionOfId_fkey"
  FOREIGN KEY ("companionOfId") REFERENCES "TicketType"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
