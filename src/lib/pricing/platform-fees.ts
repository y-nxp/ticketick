/**
 * Grille publique de ticketick, validée le 19.11.2026. Seule source des
 * montants : la page des tarifs et la page organisateur lisent ces valeurs ;
 * la FAQ et le bandeau d'accueil (`messages/*.json`) les répètent, sous le
 * contrôle de `platform-fees.test.ts`.
 *
 * Les frais de carte et de TWINT ne sont pas compris : l'argent des ventes
 * arrive sur le compte de l'organisateur, qui règle son prestataire.
 */
export type PlatformPlan = "selfService" | "premium";

export const PLATFORM_FEES: Record<PlatformPlan, { fixedCents: number; bps: number }> = {
  selfService: { fixedCents: 50, bps: 180 },
  premium: { fixedCents: 90, bps: 350 },
};

/** Plan de salle numéroté complexe, en option des deux formules. */
export const COMPLEX_SEATING_PLAN_CENTS = 29_000;

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
