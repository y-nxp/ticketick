-- Point de vente autorisé à vendre un spectacle dont la vente est suspendue.

-- AlterTable
ALTER TABLE "Reseller" ADD COLUMN     "allowPausedSales" BOOLEAN NOT NULL DEFAULT false;
