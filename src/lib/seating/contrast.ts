/**
 * Contraste des couleurs du plan de salle. Les catégories viennent des plans
 * des salles : on ne peut pas les changer, mais on peut choisir le gris des
 * places occupées pour qu'il s'en distingue par la luminosité (daltonisme).
 */

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Luminance relative (WCAG) d'une couleur `#rgb` ou `#rrggbb` ; null si illisible. */
export function luminance(hex: string): number | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  const n = parseInt(h, 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** Rapport de contraste WCAG (1 à 21) ; 1 si une couleur est illisible. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  if (la == null || lb == null) return 1;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export const TAKEN_GREYS = ["#d4d4d8", "#9a9aa3", "#5b5b64"] as const;

/** Croix des places occupées : claire sur le gris foncé, sinon l'encre du plan. */
export function takenMark(grey: string): string {
  return grey === TAKEN_GREYS[2] ? "var(--primary-foreground)" : "var(--seat-ink)";
}

/**
 * Gris des places occupées : celui des trois qui s'écarte le plus, en
 * luminosité, de la couleur de catégorie la plus proche.
 */
export function takenFill(colors: string[]): string {
  let best: string = TAKEN_GREYS[1];
  let bestMin = -1;
  for (const grey of [TAKEN_GREYS[1], TAKEN_GREYS[0], TAKEN_GREYS[2]]) {
    const min = Math.min(21, ...colors.map((c) => contrastRatio(grey, c)));
    // Le gris moyen l'emporte à égalité : la croix y reste nette.
    if (min > bestMin + 0.05) {
      bestMin = min;
      best = grey;
    }
  }
  return best;
}
