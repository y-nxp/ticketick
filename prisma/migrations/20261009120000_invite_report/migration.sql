ALTER TABLE "Organizer" ADD COLUMN "inviteReportFrequency" "ReportFrequency" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Organizer" ADD COLUMN "inviteReportEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Organizer" ADD COLUMN "lastInviteReportAt" TIMESTAMP(3);
