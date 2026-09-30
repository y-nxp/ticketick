-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "onlineSale" BOOLEAN NOT NULL DEFAULT true;
