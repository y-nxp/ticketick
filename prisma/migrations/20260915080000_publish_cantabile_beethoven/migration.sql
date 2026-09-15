-- Le concert revient au catalogue public ticketick.ch.

UPDATE "Event"
SET
  visibility = 'PUBLIC',
  featured = true,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE slug = 'beethoven-cantabile-2026';
