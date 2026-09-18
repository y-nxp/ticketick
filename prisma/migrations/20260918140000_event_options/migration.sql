-- Options de commande (navette, repas…) rattachées à un spectacle,
-- éventuellement limitées à une séance.

CREATE TYPE "EventOptionPriceMode" AS ENUM ('FLAT', 'PER_CHOICE');

CREATE TABLE "EventOption" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sessionId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "title" JSONB NOT NULL,
    "hint" JSONB,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "priceMode" "EventOptionPriceMode" NOT NULL DEFAULT 'FLAT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventOptionGroup" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EventOptionGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventOptionChoice" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "label" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EventOptionChoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderOption" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,

    CONSTRAINT "OrderOption_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventOption_eventId_enabled_idx" ON "EventOption"("eventId", "enabled");
CREATE INDEX "EventOption_sessionId_idx" ON "EventOption"("sessionId");
CREATE INDEX "EventOptionGroup_optionId_idx" ON "EventOptionGroup"("optionId");
CREATE INDEX "EventOptionChoice_groupId_idx" ON "EventOptionChoice"("groupId");
CREATE INDEX "OrderOption_orderId_idx" ON "OrderOption"("orderId");

ALTER TABLE "EventOption" ADD CONSTRAINT "EventOption_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventOption" ADD CONSTRAINT "EventOption_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "EventSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventOptionGroup" ADD CONSTRAINT "EventOptionGroup_optionId_fkey"
  FOREIGN KEY ("optionId") REFERENCES "EventOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventOptionChoice" ADD CONSTRAINT "EventOptionChoice_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "EventOptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderOption" ADD CONSTRAINT "OrderOption_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderOption" ADD CONSTRAINT "OrderOption_optionId_fkey"
  FOREIGN KEY ("optionId") REFERENCES "EventOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Navette Cantabile, séance du dimanche 15 novembre 2026 (17h Zurich).
INSERT INTO "EventOption" (
  id, "eventId", "sessionId", enabled, title, hint, "priceCents", "priceMode", "sortOrder", "updatedAt"
)
SELECT
  'opt_cantabile_navette',
  e.id,
  s.id,
  true,
  '{"fr":"Je souhaite un service de navette par minibus (5 CHF par course)","en":"I would like the minibus shuttle (CHF 5 per trip)","de":"Ich möchte den Minibus-Shuttle (5 CHF pro Fahrt)","it":"Desidero il servizio navetta in minibus (5 CHF per corsa)"}'::jsonb,
  '{"fr":"Service de navette par minibus (5 CHF par course, aller-retour à 10 CHF).","en":"Minibus shuttle (CHF 5 per trip, CHF 10 return).","de":"Minibus-Shuttle (5 CHF pro Fahrt, 10 CHF hin und zurück).","it":"Navetta in minibus (5 CHF a corsa, 10 CHF andata e ritorno)."}'::jsonb,
  500,
  'PER_CHOICE',
  0,
  CURRENT_TIMESTAMP
FROM "Event" e
JOIN "EventSession" s ON s."eventId" = e.id
WHERE e.slug = 'beethoven-cantabile-2026'
  AND s."startsAt" >= TIMESTAMPTZ '2026-11-15 00:00:00+00'
  AND s."startsAt" <  TIMESTAMPTZ '2026-11-16 00:00:00+00'
LIMIT 1;

INSERT INTO "EventOptionGroup" (id, "optionId", title, required, "sortOrder")
SELECT 'optg_navette_aller', o.id,
  '{"fr":"Aller Gare de Nyon → Abbaye de Bonmont","en":"Outbound Nyon station → Abbaye de Bonmont","de":"Hin Bahnhof Nyon → Abtei Bonmont","it":"Andata Stazione di Nyon → Abbazia di Bonmont"}'::jsonb,
  false, 0
FROM "EventOption" o WHERE o.id = 'opt_cantabile_navette';

INSERT INTO "EventOptionGroup" (id, "optionId", title, required, "sortOrder")
SELECT 'optg_navette_retour', o.id,
  '{"fr":"Retour Abbaye de Bonmont → gare de Nyon","en":"Return Abbaye de Bonmont → Nyon station","de":"Zurück Abtei Bonmont → Bahnhof Nyon","it":"Ritorno Abbazia di Bonmont → stazione di Nyon"}'::jsonb,
  false, 1
FROM "EventOption" o WHERE o.id = 'opt_cantabile_navette';

INSERT INTO "EventOptionChoice" (id, "groupId", label, "sortOrder")
SELECT 'optc_aller_1530', g.id,
  '{"fr":"Dimanche 15 novembre à 15h30","en":"Sunday 15 November at 3:30 pm","de":"Sonntag, 15. November um 15:30 Uhr","it":"Domenica 15 novembre alle 15:30"}'::jsonb, 0
FROM "EventOptionGroup" g WHERE g.id = 'optg_navette_aller';

INSERT INTO "EventOptionChoice" (id, "groupId", label, "sortOrder")
SELECT 'optc_aller_1600', g.id,
  '{"fr":"Dimanche 15 novembre à 16h","en":"Sunday 15 November at 4:00 pm","de":"Sonntag, 15. November um 16:00 Uhr","it":"Domenica 15 novembre alle 16:00"}'::jsonb, 1
FROM "EventOptionGroup" g WHERE g.id = 'optg_navette_aller';

INSERT INTO "EventOptionChoice" (id, "groupId", label, "sortOrder")
SELECT 'optc_retour_1900', g.id,
  '{"fr":"Dimanche 15 novembre à 19h","en":"Sunday 15 November at 7:00 pm","de":"Sonntag, 15. November um 19:00 Uhr","it":"Domenica 15 novembre alle 19:00"}'::jsonb, 0
FROM "EventOptionGroup" g WHERE g.id = 'optg_navette_retour';

INSERT INTO "EventOptionChoice" (id, "groupId", label, "sortOrder")
SELECT 'optc_retour_1930', g.id,
  '{"fr":"Dimanche 15 novembre à 19h30","en":"Sunday 15 November at 7:30 pm","de":"Sonntag, 15. November um 19:30 Uhr","it":"Domenica 15 novembre alle 19:30"}'::jsonb, 1
FROM "EventOptionGroup" g WHERE g.id = 'optg_navette_retour';
