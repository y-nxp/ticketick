-- Adresse réelle de l'abbaye (le pin OSM pointait trop au nord).
UPDATE "Venue"
SET
  address = 'Route de Bonmont 31',
  zip = '1275',
  lat = 46.40306,
  lng = 6.14861
WHERE id = 'venue_abbaye_bonmont';

-- La jauge n'est plus affichée au public : placement libre seulement.
UPDATE "TicketType"
SET description = '{"fr":"Placement libre.","en":"Free seating.","de":"Freie Platzwahl.","it":"Posti non numerati."}'::jsonb
WHERE id IN ('tt_cantabile_bonmont_plein', 'tt_cantabile_morges_plein');
