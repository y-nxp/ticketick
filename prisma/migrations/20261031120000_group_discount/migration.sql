-- Remise de groupe par spectacle : désactivable par spectacle, et part du
-- rabais portée par chaque ligne de commande (rapports par spectacle).

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "groupDiscountOff" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "discountCents" INTEGER NOT NULL DEFAULT 0;
