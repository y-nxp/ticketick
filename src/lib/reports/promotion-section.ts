import type { ReportTable } from "@/lib/email";
import { ATTRIBUTION_WINDOW_DAYS } from "@/lib/promotion/cookie";
import type { CampaignFigures } from "@/lib/promotion/results";
import type { ReportSection } from "./sections";

/**
 * Partie « Promotion » du rapport courriel (docs/module-promotion.md, § 5.3) :
 * une ligne par campagne active, chiffres de `results.ts`, ceux de la page de
 * la campagne. Fonction pure : le rapport lui passe les campagnes déjà
 * chargées, ses libellés et son format de montant.
 */

export interface PromotionReportRow {
  name: string;
  eventTitle: string;
  figures: CampaignFigures;
}

export interface PromotionReportBlock {
  table: ReportTable;
  summary: { label: string; value: string }[];
  footer: string;
}

type PromotionReportKey =
  | "promotionTitle"
  | "promotionCampaign"
  | "promotionClicks"
  | "promotionOrders"
  | "promotionTickets"
  | "promotionRevenue"
  | "promotionOther"
  | "promotionTotalTickets"
  | "promotionTotalRevenue"
  | "promotionTotalOther"
  | "promotionEmpty"
  | "footerPromotion";

/** Traducteur de `organizerReport`, réduit aux clés de cette partie. */
type Translate = (key: PromotionReportKey, values?: { days: number }) => string;

/**
 * `null` si la partie n'est pas choisie ou si l'organisateur n'a aucune
 * campagne active : pas de tableau vide d'une fonction qu'il n'utilise pas.
 */
export function promotionReportBlock(
  sections: readonly ReportSection[],
  rows: readonly PromotionReportRow[],
  t: Translate,
  money: (cents: number) => string,
): PromotionReportBlock | null {
  if (!sections.includes("promotion") || rows.length === 0) return null;
  const sum = (pick: (f: CampaignFigures) => number) => rows.reduce((n, r) => n + pick(r.figures), 0);
  const other = { tickets: sum((f) => f.other.tickets), cents: sum((f) => f.other.cents) };
  return {
    table: {
      title: t("promotionTitle"),
      columns: [
        t("promotionCampaign"),
        t("promotionClicks"),
        t("promotionOrders"),
        t("promotionTickets"),
        t("promotionRevenue"),
        t("promotionOther"),
      ],
      rows: rows.map(({ name, eventTitle, figures: f }) => [
        `${name} — ${eventTitle}`,
        String(f.clicks),
        String(f.orders),
        String(f.event.tickets),
        money(f.event.cents),
        f.other.tickets > 0 ? `${f.other.tickets} · ${money(f.other.cents)}` : "–",
      ]),
      empty: t("promotionEmpty"),
    },
    summary: [
      { label: t("promotionTotalTickets"), value: String(sum((f) => f.event.tickets)) },
      { label: t("promotionTotalRevenue"), value: money(sum((f) => f.event.cents)) },
      ...(other.tickets > 0
        ? [{ label: t("promotionTotalOther"), value: `${other.tickets} · ${money(other.cents)}` }]
        : []),
    ],
    footer: t("footerPromotion", { days: ATTRIBUTION_WINDOW_DAYS }),
  };
}
