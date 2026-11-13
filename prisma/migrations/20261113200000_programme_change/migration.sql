-- Programme modifié : lien limité à une séance, remboursement par virement demandé par le client.
ALTER TABLE "OrderChangeLink" ADD COLUMN "sessionId" TEXT;
CREATE INDEX "OrderChangeLink_sessionId_idx" ON "OrderChangeLink"("sessionId");

ALTER TABLE "OrderCharge" ADD COLUMN "refundIban" TEXT;
ALTER TABLE "OrderCharge" ADD COLUMN "refundHolder" TEXT;
