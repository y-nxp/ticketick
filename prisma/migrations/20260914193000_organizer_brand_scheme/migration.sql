-- Thème jour/nuit de la page hébergée, indépendant du thème ticketick.

ALTER TABLE "Organizer" ADD COLUMN "brandScheme" TEXT NOT NULL DEFAULT 'light';

UPDATE "Organizer"
SET "brandScheme" = 'light', "updatedAt" = CURRENT_TIMESTAMP
WHERE slug = 'choeur-cantabile';
