-- AlterTable
ALTER TABLE "EventOption" ADD COLUMN "ticketTitle" JSONB;

-- Navette Cantabile : texte du billet, indépendant de la case à cocher.
UPDATE "EventOption"
SET "ticketTitle" = $json${
  "fr": "Y compris service de navette par minibus (à payer directement au chauffeur)",
  "en": "Including minibus shuttle service (to be paid directly to the driver)",
  "de": "Inklusive Minibus-Shuttle (direkt beim Fahrer zu zahlen)",
  "it": "Compreso il servizio navetta in minibus (da pagare direttamente all'autista)"
}$json$::jsonb
WHERE id = 'opt_cantabile_navette';
