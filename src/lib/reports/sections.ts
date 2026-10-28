/**
 * Parties du rapport d'un organisateur. Sans `server-only` : la page des
 * réglages, les actions et les tests s'en servent.
 *
 * « promotion » (docs/module-promotion.md, § 5.3) est facultative : jamais
 * cochée par défaut, elle ne part que si elle a été choisie, et le rapport
 * l'omet tant que l'organisateur n'a pas de campagne active.
 */

/** Parties envoyées quand aucune n'est choisie, et vues de `/admin/reports`. */
export const DEFAULT_REPORT_SECTIONS = ["sales", "invitations", "remaining"] as const;

export const REPORT_SECTIONS = [...DEFAULT_REPORT_SECTIONS, "promotion"] as const;
export type ReportSection = (typeof REPORT_SECTIONS)[number];

export function readSections(raw: readonly string[]): ReportSection[] {
  const list = REPORT_SECTIONS.filter((s) => raw.includes(s));
  const tables = list.filter((s) => s !== "promotion");
  // Rien de coché parmi les parties habituelles : on les garde toutes, comme
  // avant ; « promotion » s'y ajoute seulement si elle a été choisie.
  return tables.length > 0 ? list : [...DEFAULT_REPORT_SECTIONS, ...list];
}

/**
 * Choix venu d'un formulaire. La case « promotion » n'est montrée que si
 * l'acteur voit le module et que l'organisateur a des campagnes : sinon le
 * choix déjà enregistré est conservé tel quel, pour qu'un organisateur qui ne
 * voit pas la case ne l'efface pas en enregistrant.
 *
 * Envoi immédiat (`requested` renseigné) : la partie n'est jointe que si elle
 * est demandée, et proposée à l'acteur ou déjà enregistrée.
 */
export function chosenSections(
  chosen: readonly string[],
  options: { promotionOffered: boolean; saved: readonly string[]; requested?: boolean },
): ReportSection[] {
  const allowed = options.promotionOffered || options.saved.includes("promotion");
  const keepPromotion =
    options.requested !== undefined
      ? options.requested && allowed
      : options.promotionOffered
        ? chosen.includes("promotion")
        : options.saved.includes("promotion");
  return REPORT_SECTIONS.filter((s) => (s === "promotion" ? keepPromotion : chosen.includes(s)));
}
