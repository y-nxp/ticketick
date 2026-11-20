ALTER TABLE "DoorSale" ADD COLUMN "clientKey" TEXT;
CREATE UNIQUE INDEX "DoorSale_clientKey_key" ON "DoorSale"("clientKey");
ALTER TABLE "Organizer" ADD COLUMN "tillTwintNumber" TEXT;
