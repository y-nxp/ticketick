-- Copies des billets vers les contacts de l'organisateur.
ALTER TABLE "Organizer" ADD COLUMN "notifyEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "Organizer"
SET "notifyEmails" = ARRAY[
  'communication@illyria.ch',
  'mn.favarger-schmidt@bluewin.ch'
]
WHERE slug = 'choeur-cantabile';
