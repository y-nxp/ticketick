-- Compte spectateur : opt-in offres et suivi d'organisateurs.
ALTER TABLE "User" ADD COLUMN "marketingOptIn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "marketingOptInAt" TIMESTAMP(3);

CREATE TABLE "OrganizerFollow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizerFollow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizerFollow_userId_organizerId_key" ON "OrganizerFollow"("userId", "organizerId");
CREATE INDEX "OrganizerFollow_organizerId_idx" ON "OrganizerFollow"("organizerId");

ALTER TABLE "OrganizerFollow" ADD CONSTRAINT "OrganizerFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizerFollow" ADD CONSTRAINT "OrganizerFollow_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
