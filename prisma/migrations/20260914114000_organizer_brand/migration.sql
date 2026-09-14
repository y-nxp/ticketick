-- Charte visuelle pour la page hébergée (/go/…) et le widget WordPress.

ALTER TABLE "Organizer" ADD COLUMN "brandPrimary" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "brandAccent" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "brandBg" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "navLinks" JSONB;

-- Chœur Cantabile : or / bordeaux de choeurcantabile.ch, menu vers leur site.
UPDATE "Organizer"
SET
  "logoUrl" = '/partners/choeur-cantabile/logo.png',
  "brandPrimary" = '#3A1018',
  "brandAccent" = '#DE7C0C',
  "brandBg" = '#FFFFFF',
  "navLinks" = '[
    {"label":"Accueil","href":"https://www.choeurcantabile.ch/"},
    {"label":"Actus","href":"https://www.choeurcantabile.ch/actualites"},
    {"label":"L’Association","href":"https://www.choeurcantabile.ch/l-association/comite"},
    {"label":"Photos","href":"https://www.choeurcantabile.ch/galerie-photos"},
    {"label":"Audios","href":"https://www.choeurcantabile.ch/extraits-audio"},
    {"label":"Archives","href":"https://www.choeurcantabile.ch/archives/2025"},
    {"label":"Contact","href":"https://www.choeurcantabile.ch/contact"}
  ]'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE slug = 'choeur-cantabile';
