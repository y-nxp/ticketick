-- Jeton de rétention : seule son empreinte est stockée. Les commandes
-- existantes n'en ont pas et ne peuvent donc plus être reprises ni annulées
-- par leur seule référence.

ALTER TABLE "Order" ADD COLUMN "holdTokenHash" TEXT;
