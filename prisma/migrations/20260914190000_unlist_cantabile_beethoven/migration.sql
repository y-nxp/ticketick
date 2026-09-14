-- Concert Cantabile : hors catalogue ticketick. Visible dans l'espace
-- Illyria Communication (spectacle, commandes, paramètres) et par le lien /go/.

UPDATE "Event"
SET
  visibility = 'UNLISTED',
  featured = false,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE slug = 'beethoven-cantabile-2026';
