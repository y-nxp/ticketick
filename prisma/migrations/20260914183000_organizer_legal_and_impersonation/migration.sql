-- CG / logo responsable sur l'organisateur, et session d'impersonation.
ALTER TABLE "Organizer" ADD COLUMN "producerName" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "producerUrl" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "producerLogoUrl" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "ticketDisclaimer" JSONB;

ALTER TABLE "Session" ADD COLUMN "impersonatorId" TEXT;

CREATE INDEX "Session_impersonatorId_idx" ON "Session"("impersonatorId");

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_impersonatorId_fkey"
  FOREIGN KEY ("impersonatorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Concert Cantabile : Illyria est déjà le responsable de fait.
UPDATE "Organizer"
SET
  "producerName" = 'Illyria Communication',
  "producerUrl" = 'https://illyria.ch',
  "producerLogoUrl" = '/partners/illyria/logo.png',
  "ticketDisclaimer" = '{
    "fr": "En achetant ce billet, vous vous engagez à respecter les conditions générales ci-dessous ainsi que les principes de sécurité et d''accès des spectacles. Aucun remboursement ne sera effectué sauf en cas d''annulation du spectacle. Ce billet vous donne accès à l''événement mentionné ci-dessus. En cas d''annulation, pour obtenir le remboursement, envoyez votre billet par mail dans les 10 jours maximum après l''événement à communication@illyria.ch, avec vos coordonnées complètes y compris bancaires. Des frais uniques de traitement de 10 CHF seront retenus (indépendamment du nombre de billets). Pour toute question : 022 970 00 84. For juridique : Lausanne. Version 1.12.2023. Responsable : Illyria Communication — illyria.ch",
    "en": "By buying this ticket you agree to the terms below and to the venue''s safety and access rules. No refund except if the show is cancelled. This ticket admits you to the event named above. If the show is cancelled, email your ticket within 10 days after the event to communication@illyria.ch, with your full contact and bank details. A single 10 CHF handling fee is deducted regardless of how many tickets you bought. Questions: 022 970 00 84. Place of jurisdiction: Lausanne. Version 1.12.2023. Responsible party: Illyria Communication — illyria.ch",
    "de": "Mit dem Kauf dieses Tickets akzeptieren Sie die nachstehenden Bedingungen sowie die Sicherheits- und Zugangsregeln der Veranstaltung. Keine Rückerstattung, ausser bei Absage der Vorstellung. Dieses Ticket gilt für die oben genannte Veranstaltung. Bei Absage senden Sie das Ticket innert 10 Tagen nach dem Anlass an communication@illyria.ch, mit vollständigen Kontaktdaten und Bankverbindung. Eine einmalige Bearbeitungsgebühr von 10 CHF wird abgezogen (unabhängig von der Ticketanzahl). Fragen: 022 970 00 84. Gerichtsstand: Lausanne. Version 1.12.2023. Verantwortliche: Illyria Communication — illyria.ch",
    "it": "Acquistando questo biglietto accettate le condizioni seguenti e le regole di sicurezza e di accesso dello spettacolo. Nessun rimborso salvo annullamento dello spettacolo. Il biglietto dà accesso all''evento indicato. In caso di annullamento, inviate il biglietto per e-mail entro 10 giorni dall''evento a communication@illyria.ch, con i dati completi e bancari. Una tassa unica di trattamento di 10 CHF sarà trattenuta (indipendentemente dal numero di biglietti). Domande: 022 970 00 84. Foro: Losanna. Versione 1.12.2023. Responsabile: Illyria Communication — illyria.ch"
  }'::jsonb
WHERE slug = 'choeur-cantabile'
  AND "producerName" IS NULL;
