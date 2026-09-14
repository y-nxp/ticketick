-- Version des CG Illyria imprimées sur les billets.
UPDATE "Organizer"
SET "ticketDisclaimer" = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        "ticketDisclaimer",
        '{fr}',
        to_jsonb(replace("ticketDisclaimer"->>'fr', 'Version 1.12.2023', 'Version 1.09.2026'))
      ),
      '{en}',
      to_jsonb(replace("ticketDisclaimer"->>'en', 'Version 1.12.2023', 'Version 1.09.2026'))
    ),
    '{de}',
    to_jsonb(replace("ticketDisclaimer"->>'de', 'Version 1.12.2023', 'Version 1.09.2026'))
  ),
  '{it}',
  to_jsonb(replace("ticketDisclaimer"->>'it', 'Versione 1.12.2023', 'Versione 1.09.2026'))
)
WHERE "ticketDisclaimer" IS NOT NULL;
