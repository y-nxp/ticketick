-- Module Promotion (docs/module-promotion.md, § 3) : migration additive.
-- Nouvelles tables seulement ; sur "Order", trois colonnes facultatives.

-- CreateEnum
CREATE TYPE "SocialProvider" AS ENUM ('FACEBOOK_PAGE', 'INSTAGRAM_BUSINESS', 'TIKTOK');

-- CreateEnum
CREATE TYPE "SocialAccountStatus" AS ENUM ('ACTIVE', 'NEEDS_RECONNECT', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "PromotionKind" AS ENUM ('ORGANIC', 'PAID');

-- CreateEnum
CREATE TYPE "PromotionPostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "promotionCampaignId" TEXT,
ADD COLUMN     "promotionClickAt" TIMESTAMP(3),
ADD COLUMN     "promotionSource" TEXT;

-- CreateTable
CREATE TABLE "OrganizerSocialAccount" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "provider" "SocialProvider" NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT,
    "pictureUrl" TEXT,
    "tokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "viaAccountId" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "SocialAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastError" TEXT,
    "connectedById" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizerSocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionCampaign" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sessionId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PromotionKind" NOT NULL DEFAULT 'ORGANIC',
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "landing" TEXT NOT NULL DEFAULT 'go',
    "budgetCents" INTEGER,
    "spentCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'CHF',
    "externalAdRefs" JSONB,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromotionCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionPost" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "status" "PromotionPostStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "message" TEXT NOT NULL,
    "imagePath" TEXT,
    "linkUrl" TEXT NOT NULL,
    "externalId" TEXT,
    "permalink" TEXT,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "claimedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromotionPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionPostLog" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "httpStatus" INTEGER,
    "errorCode" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionPostLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionClickDay" (
    "campaignId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "source" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PromotionClickDay_pkey" PRIMARY KEY ("campaignId","day","source")
);

-- CreateIndex
CREATE INDEX "Order_promotionCampaignId_idx" ON "Order"("promotionCampaignId");

-- CreateIndex
CREATE INDEX "OrganizerSocialAccount_organizerId_status_idx" ON "OrganizerSocialAccount"("organizerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizerSocialAccount_organizerId_provider_externalId_key" ON "OrganizerSocialAccount"("organizerId", "provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionCampaign_code_key" ON "PromotionCampaign"("code");

-- CreateIndex
CREATE INDEX "PromotionCampaign_organizerId_createdAt_idx" ON "PromotionCampaign"("organizerId", "createdAt");

-- CreateIndex
CREATE INDEX "PromotionCampaign_eventId_idx" ON "PromotionCampaign"("eventId");

-- CreateIndex
CREATE INDEX "PromotionPost_status_scheduledAt_idx" ON "PromotionPost"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "PromotionPost_campaignId_idx" ON "PromotionPost"("campaignId");

-- CreateIndex
CREATE INDEX "PromotionPost_accountId_idx" ON "PromotionPost"("accountId");

-- CreateIndex
CREATE INDEX "PromotionPostLog_postId_createdAt_idx" ON "PromotionPostLog"("postId", "createdAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_promotionCampaignId_fkey" FOREIGN KEY ("promotionCampaignId") REFERENCES "PromotionCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizerSocialAccount" ADD CONSTRAINT "OrganizerSocialAccount_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizerSocialAccount" ADD CONSTRAINT "OrganizerSocialAccount_viaAccountId_fkey" FOREIGN KEY ("viaAccountId") REFERENCES "OrganizerSocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionCampaign" ADD CONSTRAINT "PromotionCampaign_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionCampaign" ADD CONSTRAINT "PromotionCampaign_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionPost" ADD CONSTRAINT "PromotionPost_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "PromotionCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionPost" ADD CONSTRAINT "PromotionPost_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "OrganizerSocialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionPostLog" ADD CONSTRAINT "PromotionPostLog_postId_fkey" FOREIGN KEY ("postId") REFERENCES "PromotionPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionClickDay" ADD CONSTRAINT "PromotionClickDay_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "PromotionCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
