# TICKETICK — logo et icônes

## Couleurs (alignées sur celles du site)
- Anthracite #2A2C30 — lettres du logo sur fond clair
- Blanc #FFFFFF — lettres du logo sur fond sombre, barres de l'icône violette
- Violet #6C5CE7 — le E en trois barres (signature, aussi utilisé pour les boutons du site)
- Fond sombre #1E1F23 — fond des versions avec fond sombre, de l'icône et du favicon
- Fond clair #F8F9FA — fond de la version avec fond clair

## Typographie
- Logo : Jost, en capitales, interlettrage modéré (pensé pour cohabiter avec les titres du site en Inter ExtraBold). Texte vectorisé dans les SVG : aucune police à charger.
  - Version standard : Jost Medium
  - Version petites tailles : Jost SemiBold, même espacement, trait plus épais pour garder sa présence en petit
- Site : Inter

## Fichiers
Logo standard (24 px de haut et plus), capitales de 700 unités, viewBox 0 -13 5820 725
(le cadre inclut le débord du C au-dessus et au-dessous des capitales) :
- ticketick-logo.svg — fond clair (lettres anthracite)
- ticketick-logo-inverse.svg — fond sombre (lettres blanches)

Logo petites tailles (moins de 24 px de haut), capitales de 700 unités, viewBox 0 -14 6010 728 :
- ticketick-logo-small.svg — fond clair
- ticketick-logo-small-inverse.svg — fond sombre
- ticketick-logo-small.png — PNG transparent 2400 × 291 px, pour les courriels

Versions avec fond, marge de 700 unités autour du mot, viewBox 7220 × 2100 :
- ticketick-logo-fond-nuit.svg / .png (2400 px) — fond sombre #1E1F23
- ticketick-logo-fond-ivoire.svg — fond clair #F8F9FA
  (les noms « nuit » et « ivoire » sont conservés pour la compatibilité, les couleurs sont celles ci-dessus)

Monochromes, viewBox 0 -13 5820 725 :
- ticketick-logo-mono-anthracite.svg — tout en #2A2C30 (impression une couleur, gravure, tampon)
- ticketick-logo-mono-blanc.svg — tout en blanc, sur fond foncé ou photo

Impression (dossier docs/brand/impression du site, générés par Inkscape) :
- ticketick-logo, -inverse, -mono-noir, -mono-blanc, -fond-nuit, -fond-ivoire en PDF et EPS vectoriels
- ticketick-logo-mono-noir.svg / .png — tout en noir #000000, pour l'impression une couleur au noir
  (l'anthracite y sortirait en gris tramé)

Partage sur les réseaux sociaux :
- src/app/[locale]/opengraph-image.png (1200 × 630) — fond #1E1F23, logo à 60 % de la largeur

Icônes :
- ticketick-icone.svg / ticketick-icone-512.png — icône d'app, barres violettes sur #1E1F23
- ticketick-icone-violet.svg — variante, barres blanches sur violet
- favicon.svg, favicon.ico (16, 32, 48), favicon-32.png, apple-touch-icon.png (180 px)

## Règles
- Sous 24 px de haut, utiliser la version small ; au-dessus, la version standard.
- Le E reste toujours violet sur les versions couleur, avec la barre du milieu plus courte.
- Laisser autour du logo une marge au moins égale à la hauteur des lettres.
- Toujours utiliser les fichiers ; ne jamais recomposer le logo en texte HTML.
- Ne pas déformer, recolorer, ni ajouter d'ombre ou de dégradé.
