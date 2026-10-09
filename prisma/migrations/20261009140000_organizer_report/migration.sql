ALTER TABLE "Organizer" RENAME COLUMN "inviteReportFrequency" TO "reportFrequency";
ALTER TABLE "Organizer" RENAME COLUMN "inviteReportEmails" TO "reportEmails";
ALTER TABLE "Organizer" RENAME COLUMN "lastInviteReportAt" TO "lastReportAt";
ALTER TABLE "Organizer" ADD COLUMN "reportSections" TEXT[] NOT NULL DEFAULT ARRAY['sales', 'invitations', 'remaining']::TEXT[];
ALTER TABLE "Organizer" ADD COLUMN "lastReportSentAt" TIMESTAMP(3);
