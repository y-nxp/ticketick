-- Équipe d'entrée : contrôle et/ou caisse, caisse éventuellement limitée à un spectacle.
ALTER TABLE "User" ADD COLUMN "doorScan" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "doorTill" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "doorTillEventId" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_doorTillEventId_fkey" FOREIGN KEY ("doorTillEventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Les contrôleurs qui voyaient déjà la caisse (organisateur avec Stripe) la gardent.
UPDATE "User" u SET "doorTill" = true
WHERE u.role = 'DOOR_STAFF'
  AND EXISTS (
    SELECT 1 FROM "OrganizerStripeAccount" s
    WHERE s.enabled AND (u."doorOrganizerId" IS NULL OR s."organizerId" = u."doorOrganizerId")
  );
