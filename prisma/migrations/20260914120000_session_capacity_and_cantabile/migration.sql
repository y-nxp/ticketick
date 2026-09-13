-- Jauge de séance (tous tarifs) et tarif accompagnant (N gratuits / billet payant).

ALTER TABLE "EventSession" ADD COLUMN "capacity" INTEGER;
ALTER TABLE "EventSession" ADD COLUMN "sold" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "TicketType" ADD COLUMN "maxPerPaidTicket" INTEGER;

-- Recalcule les places déjà retenues, pour que la jauge parte du réel.
UPDATE "EventSession" AS s
SET sold = COALESCE((
  SELECT SUM(tt.sold) FROM "TicketType" AS tt WHERE tt."sessionId" = s.id
), 0);

-- ── Concert Cantabile / Beethoven, novembre 2026

INSERT INTO "Organizer" (
  id, slug, name, email, description, website, "friendsAppEnabled", "createdAt", "updatedAt"
) VALUES (
  'org_choeur_cantabile',
  'choeur-cantabile',
  'Chœur Cantabile',
  'info@choeurcantabile.ch',
  'Chœur classique mixte de la région de Nyon, basé à Crassier.',
  'https://www.choeurcantabile.ch',
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  description = EXCLUDED.description,
  website = EXCLUDED.website,
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Venue" (id, name, address, city, canton, country, zip, lat, lng) VALUES
(
  'venue_abbaye_bonmont',
  'Abbaye de Bonmont',
  'Route de l''Abbaye',
  'Chéserex',
  'VD',
  'CH',
  '1275',
  46.4414,
  6.1517
),
(
  'venue_temple_morges',
  'Temple de Morges',
  'Place de l''Église 2',
  'Morges',
  'VD',
  'CH',
  '1110',
  46.5097,
  6.4986
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  address = EXCLUDED.address,
  city = EXCLUDED.city,
  canton = EXCLUDED.canton,
  zip = EXCLUDED.zip,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng;

INSERT INTO "Event" (
  id, slug, title, description, status, visibility, featured, "coverImage", gallery, "organizerId", "createdAt", "updatedAt"
)
SELECT
  'evt_cantabile_beethoven_2026',
  'beethoven-cantabile-2026',
  '{
    "fr": "Beethoven — Messe en ut & Fantaisie chorale",
    "en": "Beethoven — Mass in C & Choral Fantasy",
    "de": "Beethoven — Messe in C & Chorfantasie",
    "it": "Beethoven — Messa in Do e Fantasia corale"
  }'::jsonb,
  '{
    "fr": "Le Chœur Cantabile, accompagné de musiciens du Sinfonietta de Lausanne, présente la Messe en ut majeur op. 86 et la Fantaisie pour piano, solistes, chœur et orchestre op. 80 de Beethoven. Solistes : Catherine Dutoit (soprano), Valérie Bonnard (mezzo-soprano), Oscar Esmerode (ténor), Raphaël Hardmeyer (baryton-basse), Adalberto Riva (piano). Concerts donnés un peu en avance pour le bicentenaire de la disparition de Beethoven (2027).\n\nPlacement libre. Plein tarif CHF 35.—. Gratuit jusqu’à 16 ans révolus, sur inscription, à raison de 2 places gratuites maximum par billet payant.",
    "en": "The Chœur Cantabile, joined by musicians from the Sinfonietta de Lausanne, performs Beethoven’s Mass in C major, Op. 86, and the Fantasy for piano, soloists, choir and orchestra, Op. 80. Soloists: Catherine Dutoit (soprano), Valérie Bonnard (mezzo-soprano), Oscar Esmerode (tenor), Raphaël Hardmeyer (baritone-bass), Adalberto Riva (piano). Given a little early to mark the bicentenary of Beethoven’s death (2027).\n\nFree seating. Full price CHF 35. Free admission up to the age of 16, with registration, at most 2 free seats per paying ticket.",
    "de": "Der Chœur Cantabile, begleitet von Musikerinnen und Musikern der Sinfonietta de Lausanne, präsentiert Beethovens Messe in C-Dur op. 86 und die Fantasie für Klavier, Solisten, Chor und Orchester op. 80. Solisten: Catherine Dutoit (Sopran), Valérie Bonnard (Mezzosopran), Oscar Esmerode (Tenor), Raphaël Hardmeyer (Bariton-Bass), Adalberto Riva (Klavier). Die Konzerte finden etwas früher statt, zum zweihundertsten Todestag Beethovens (2027).\n\nFreie Platzwahl. Vollpreis CHF 35.—. Eintritt frei bis zum vollendeten 16. Lebensjahr, mit Anmeldung, höchstens 2 Gratiskarten pro bezahltes Ticket.",
    "it": "Il Chœur Cantabile, accompagnato da musicisti della Sinfonietta de Lausanne, presenta la Messa in Do maggiore op. 86 e la Fantasia per pianoforte, solisti, coro e orchestra op. 80 di Beethoven. Solisti: Catherine Dutoit (soprano), Valérie Bonnard (mezzosoprano), Oscar Esmerode (tenore), Raphaël Hardmeyer (baritono-basso), Adalberto Riva (pianoforte). Concerti anticipati per il bicentenario della scomparsa di Beethoven (2027).\n\nPosti non numerati. Prezzo intero CHF 35.—. Ingresso gratuito fino ai 16 anni compiuti, con iscrizione, al massimo 2 posti gratuiti per biglietto a pagamento."
  }'::jsonb,
  'PUBLISHED',
  'PUBLIC',
  true,
  'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=1600&q=80',
  ARRAY[]::text[],
  o.id,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Organizer" o
WHERE o.slug = 'choeur-cantabile'
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  visibility = EXCLUDED.visibility,
  featured = EXCLUDED.featured,
  "coverImage" = EXCLUDED."coverImage",
  "organizerId" = EXCLUDED."organizerId",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Category" (id, slug, name, color) VALUES
  ('c-classique', 'classique', '{"fr":"Classique","en":"Classical","de":"Klassik","it":"Classica"}'::jsonb, '#0f9d6e'),
  ('c-concert', 'concert', '{"fr":"Concert","en":"Concert","de":"Konzert","it":"Concerto"}'::jsonb, '#6c5ce7')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO "_EventCategories" ("A", "B")
SELECT c.id, e.id
FROM "Event" e
JOIN "Category" c ON c.slug IN ('classique', 'concert')
WHERE e.slug = 'beethoven-cantabile-2026'
ON CONFLICT DO NOTHING;

-- Heures en UTC (Europe/Zurich, heure d'hiver) : 17h / 18h locales.
INSERT INTO "EventSession" (
  id, "eventId", label, "startsAt", "endsAt", "doorsAt", status, "venueId", capacity, sold, "createdAt", "updatedAt"
)
SELECT
  'sess_cantabile_bonmont_20261115',
  e.id,
  '{"fr":"Placement libre","en":"Free seating","de":"Freie Platzwahl","it":"Posti non numerati"}'::jsonb,
  TIMESTAMPTZ '2026-11-15 16:00:00+00',
  TIMESTAMPTZ '2026-11-15 18:00:00+00',
  TIMESTAMPTZ '2026-11-15 15:30:00+00',
  'PUBLISHED',
  'venue_abbaye_bonmont',
  350,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Event" e WHERE e.slug = 'beethoven-cantabile-2026'
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  "startsAt" = EXCLUDED."startsAt",
  "endsAt" = EXCLUDED."endsAt",
  "doorsAt" = EXCLUDED."doorsAt",
  status = EXCLUDED.status,
  "venueId" = EXCLUDED."venueId",
  capacity = EXCLUDED.capacity,
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "EventSession" (
  id, "eventId", label, "startsAt", "endsAt", "doorsAt", status, "venueId", capacity, sold, "createdAt", "updatedAt"
)
SELECT
  'sess_cantabile_morges_20261121',
  e.id,
  '{"fr":"Placement libre","en":"Free seating","de":"Freie Platzwahl","it":"Posti non numerati"}'::jsonb,
  TIMESTAMPTZ '2026-11-21 17:00:00+00',
  TIMESTAMPTZ '2026-11-21 19:00:00+00',
  TIMESTAMPTZ '2026-11-21 16:30:00+00',
  'PUBLISHED',
  'venue_temple_morges',
  300,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Event" e WHERE e.slug = 'beethoven-cantabile-2026'
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  "startsAt" = EXCLUDED."startsAt",
  "endsAt" = EXCLUDED."endsAt",
  "doorsAt" = EXCLUDED."doorsAt",
  status = EXCLUDED.status,
  "venueId" = EXCLUDED."venueId",
  capacity = EXCLUDED.capacity,
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "TicketType" (
  id, "sessionId", name, description, "priceCents", currency, quantity, sold, "maxPerOrder", "maxPerPaidTicket"
) VALUES
(
  'tt_cantabile_bonmont_plein',
  'sess_cantabile_bonmont_20261115',
  '{"fr":"Plein tarif","en":"Full price","de":"Vollpreis","it":"Prezzo intero"}'::jsonb,
  '{"fr":"Placement libre.","en":"Free seating.","de":"Freie Platzwahl.","it":"Posti non numerati."}'::jsonb,
  3500,
  'CHF',
  350,
  0,
  10,
  NULL
),
(
  'tt_cantabile_bonmont_moins16',
  'sess_cantabile_bonmont_20261115',
  '{"fr":"Gratuit — jusqu’à 16 ans","en":"Free — 16 and under","de":"Gratis — bis 16 Jahre","it":"Gratuito — fino a 16 anni"}'::jsonb,
  '{"fr":"Jusqu’à 16 ans révolus, sur inscription. Au plus 2 places gratuites par billet payant.","en":"Up to age 16, with registration. At most 2 free seats per paying ticket.","de":"Bis zum vollendeten 16. Lebensjahr, mit Anmeldung. Höchstens 2 Gratiskarten pro bezahltes Ticket.","it":"Fino ai 16 anni compiuti, con iscrizione. Al massimo 2 posti gratuiti per biglietto a pagamento."}'::jsonb,
  0,
  'CHF',
  350,
  0,
  20,
  2
),
(
  'tt_cantabile_morges_plein',
  'sess_cantabile_morges_20261121',
  '{"fr":"Plein tarif","en":"Full price","de":"Vollpreis","it":"Prezzo intero"}'::jsonb,
  '{"fr":"Placement libre. Jauge de cette séance : 300 places.","en":"Free seating. 300 seats for this performance.","de":"Freie Platzwahl. 300 Plätze für diese Vorstellung.","it":"Posti non numerati. 300 posti per questa serata."}'::jsonb,
  3500,
  'CHF',
  300,
  0,
  10,
  NULL
),
(
  'tt_cantabile_morges_moins16',
  'sess_cantabile_morges_20261121',
  '{"fr":"Gratuit — jusqu’à 16 ans","en":"Free — 16 and under","de":"Gratis — bis 16 Jahre","it":"Gratuito — fino a 16 anni"}'::jsonb,
  '{"fr":"Jusqu’à 16 ans révolus, sur inscription. Au plus 2 places gratuites par billet payant.","en":"Up to age 16, with registration. At most 2 free seats per paying ticket.","de":"Bis zum vollendeten 16. Lebensjahr, mit Anmeldung. Höchstens 2 Gratiskarten pro bezahltes Ticket.","it":"Fino ai 16 anni compiuti, con iscrizione. Al massimo 2 posti gratuiti per biglietto a pagamento."}'::jsonb,
  0,
  'CHF',
  300,
  0,
  20,
  2
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  "priceCents" = EXCLUDED."priceCents",
  quantity = EXCLUDED.quantity,
  "maxPerOrder" = EXCLUDED."maxPerOrder",
  "maxPerPaidTicket" = EXCLUDED."maxPerPaidTicket";
