-- CreateEnum
CREATE TYPE "InquiryFormat" AS ENUM ('ONE_DAY', 'MULTI_DAY', 'MULTI_SESSION', 'UNSURE');

-- CreateTable
CREATE TABLE "OrganizerInquiry" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "format" "InquiryFormat" NOT NULL,
    "message" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizerInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizerInquiry_createdAt_idx" ON "OrganizerInquiry"("createdAt");
