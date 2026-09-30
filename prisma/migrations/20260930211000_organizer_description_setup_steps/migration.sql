-- AlterTable : présentation de l'organisateur traduite, l'ancien texte devient le français.
ALTER TABLE "Organizer" ALTER COLUMN "description" TYPE JSONB
  USING CASE WHEN "description" IS NULL THEN NULL ELSE jsonb_build_object('fr', "description") END;

-- CreateTable
CREATE TABLE "SetupStep" (
    "key" TEXT NOT NULL,
    "doneAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SetupStep_pkey" PRIMARY KEY ("key")
);
