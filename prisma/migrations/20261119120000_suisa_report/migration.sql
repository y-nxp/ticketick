-- CreateEnum
CREATE TYPE "SuisaMusic" AS ENUM ('PROTECTED', 'PUBLIC_DOMAIN', 'NONE');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "suisaMusic" "SuisaMusic";

-- AlterTable
ALTER TABLE "EventSession" ADD COLUMN "doorTickets" INTEGER,
ADD COLUMN "doorRevenueCents" INTEGER;
