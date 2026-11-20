/**
 * Grille publique de ticketick, validée le 19.11.2026, en vigueur dès le
 * 20.11.2026 (date de publication). Seule source des
 * montants : la page des tarifs et la page organisateur lisent ces valeurs ;
 * la FAQ et le bandeau d'accueil (`messages/*.json`) les répètent, sous le
 * contrôle de `platform-fees.test.ts`.
 *
 * Les frais de carte et de TWINT ne sont pas compris : l'argent des ventes
 * arrive sur le compte de l'organisateur, qui règle son prestataire.
 */
export type PlatformPlan = "selfService" | "premium";

export interface PricingVersion {
  /** Premier jour d'application, AAAA-MM-JJ (heure suisse). */
  from: string;
  fees: Record<PlatformPlan, { fixedCents: number; bps: number }>;
  /** Plan de salle numéroté complexe, en option des deux formules. */
  complexSeatingPlanCents: number;
}

/**
 * Grilles successives, de la plus ancienne à la plus récente. Pour changer
 * un prix, on ajoute une grille datée sans toucher aux précédentes : la page
 * des tarifs en garde l'historique, et chacun sait quelle grille valait à
 * quelle date.
 */
export const PRICING_HISTORY: PricingVersion[] = [
  {
    from: "2026-11-20",
    fees: {
      selfService: { fixedCents: 50, bps: 180 },
      premium: { fixedCents: 90, bps: 350 },
    },
    complexSeatingPlanCents: 29_000,
  },
];

/** Grille en vigueur à une date (AAAA-MM-JJ) ; la première avant son début. */
export function pricingAt(day: string): PricingVersion {
  let found = PRICING_HISTORY[0]!;
  for (const version of PRICING_HISTORY) if (version.from <= day) found = version;
  return found;
}

/** Grille en vigueur : la plus récente. */
export const CURRENT_PRICING: PricingVersion = PRICING_HISTORY.at(-1)!;

export const PLATFORM_FEES = CURRENT_PRICING.fees;

/** Plan de salle numéroté complexe, en option des deux formules. */
export const COMPLEX_SEATING_PLAN_CENTS = CURRENT_PRICING.complexSeatingPlanCents;

/** « 20.11.2026 » : date d'une grille, à la suisse. */
export function pricingDate(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}.${m}.${y}`;
}

/** Billets utilisés pour les exemples chiffrés de la page des tarifs. */
export const EXAMPLE_TICKET_PRICES_CENTS = [2_000, 3_500, 8_000];

/** Commission ticketick sur un billet, en centimes. Un billet gratuit ne coûte rien. */
export function platformFeeCents(plan: PlatformPlan, ticketPriceCents: number): number {
  if (ticketPriceCents <= 0) return 0;
  const { fixedCents, bps } = PLATFORM_FEES[plan];
  return fixedCents + Math.round((ticketPriceCents * bps) / 10_000);
}

/** « 0.50 », « 35.00 » : montants en francs, à la suisse. */
export function chf(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** « 1,8 % », « 3.5% » : pourcentage dans l'usage de la langue. */
export function percentLabel(bps: number, locale: string): string {
  const value = bps / 100;
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
  if (locale === "fr") return `${text.replace(".", ",")} %`;
  if (locale === "it") return `${text.replace(".", ",")}%`;
  return `${text}%`;
}
