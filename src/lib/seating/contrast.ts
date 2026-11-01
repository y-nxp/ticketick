/**
 * Contraste des couleurs du plan de salle. Les catégories viennent des plans
 * des salles : on ne peut pas les changer, mais le gris des places occupées
 * doit s'en distinguer par la luminosité, pas seulement par la teinte
 * (daltonisme). Le test vérifie ce gris contre les couleurs connues.
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

/**
 * Gris des places occupées : un seul gris, moyen. Il s'écarte en luminosité
 * de la lavande du prix unique et des pastels des catégories (Rougemont
 * Cat. 2 comprise) sans assombrir le plan, et la croix d'encre y reste nette.
 */
export const TAKEN_GREY = "#9a9aa3";
