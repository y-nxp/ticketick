-- Annulation d'une vente de la caisse (gardée pour la trace) et responsable de caisse.
ALTER TABLE "DoorSale" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "DoorSale" ADD COLUMN "cancelledById" TEXT;
ALTER TABLE "DoorSale" ADD COLUMN "cancelReason" TEXT;
ALTER TABLE "DoorSale" ADD CONSTRAINT "DoorSale_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "User" ADD COLUMN "doorTillManager" BOOLEAN NOT NULL DEFAULT false;
