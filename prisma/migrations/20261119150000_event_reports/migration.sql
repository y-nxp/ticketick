-- AlterTable
ALTER TABLE "Organizer" ADD COLUMN "eventReports" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "lastEventReportDay" TEXT;

-- AlterTable
ALTER TABLE "EventSession" ADD COLUMN "hourReportAt" TIMESTAMP(3);
