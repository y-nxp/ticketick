/**
 * Chiffres du rapport SUISA (tarif commun K 2025-2029), séance par séance.
 *
 * La redevance se calcule sur les recettes brutes des billets, ventes des
 * intermédiaires comprises, TVA et impôt sur les billets déduits (ch. 11.1).
 * Un « grand concert » a une jauge d'au moins 1'000 personnes ou plus de
 * CHF 22'000 de recettes (ch. 4.1) ; les autres sont « petits ».
 *
 * Partie pure : aucun accès à la base, pour être testée telle quelle.
 */

export type SuisaMusicValue = "PROTECTED" | "PUBLIC_DOMAIN" | "NONE";

/** Seuil des grands concerts (ch. 4.1), en centimes hors TVA. */
export const LARGE_CONCERT_REVENUE_CENTS = 2_200_000;
/** Seuil des grands concerts (ch. 4.1), en personnes. */
export const LARGE_CONCERT_CAPACITY = 1_000;

export interface SuisaSessionInput {
  sessionId: string;
  eventId: string;
  eventTitle: unknown;
  startsAt: Date;
  venue: string | null;
  /** Jauge connue de ticketick ; null si la séance n'en a pas. */
  capacity: number | null;
  music: SuisaMusicValue | null;
  doorTickets: number | null;
  doorRevenueCents: number | null;
}

/** Billet valable d'une commande payée, avec sa part de la recette. */
export interface SuisaTicket {
  sessionId: string;
  revenueCents: number;
}

export interface SuisaFigures {
  /** Billets émis contre paiement par ticketick (en ligne, points de vente, guichet). */
  paid: number;
  /** Billets émis à 0 fr. : invitations, gratuités. */
  offered: number;
  /** Recette TTC des billets ticketick, rabais déduits, frais ticketick exclus. */
  ticketickCents: number;
  /** Caisse du soir tenue hors ticketick. */
  doorTickets: number;
  doorCents: number;
  /** Billets payants, ticketick et caisse du soir. */
  paidTotal: number;
  /** Tous les billets : payants et offerts. */
  tickets: number;
  /** Recette brute TTC : ticketick et caisse du soir. */
  grossCents: number;
  /** Base SUISA : recette brute, TVA effectivement due déduite. */
  baseCents: number;
  /** Places retenues dont le paiement est attendu : pas encore dans la recette. */
  pending: number;
}

export interface SuisaRow
  extends Omit<SuisaSessionInput, "doorTickets" | "doorRevenueCents">,
    SuisaFigures {
  /** Grand concert au sens du ch. 4.1. */
  large: boolean;
}

export interface SuisaReport {
  rows: SuisaRow[];
  /** Toutes les séances relevant du tarif K (musique protégée, libre ou à indiquer). */
  totals: SuisaFigures & { sessions: number };
  /** Dont les séances avec au moins une œuvre protégée. */
  protectedTotals: SuisaFigures & { sessions: number };
  /** Séances dont la musique n'est pas encore indiquée. */
  unmarked: number;
}

const ZERO: SuisaFigures = {
  paid: 0,
  offered: 0,
  ticketickCents: 0,
  doorTickets: 0,
  doorCents: 0,
  paidTotal: 0,
  tickets: 0,
  grossCents: 0,
  baseCents: 0,
  pending: 0,
};

/** Montant hors TVA, `vatPercent` étant le taux effectivement dû (0 si exonéré). */
export function withoutVat(cents: number, vatPercent: number): number {
  if (vatPercent <= 0) return cents;
  return Math.round(cents / (1 + vatPercent / 100));
}

export function buildSuisaReport(
  sessions: SuisaSessionInput[],
  tickets: SuisaTicket[],
  pending: Map<string, number>,
  vatPercent: number,
): SuisaReport {
  const sold = new Map<string, { paid: number; offered: number; cents: number }>();
  for (const t of tickets) {
    const s = sold.get(t.sessionId) ?? { paid: 0, offered: 0, cents: 0 };
    if (t.revenueCents > 0) {
      s.paid += 1;
      s.cents += t.revenueCents;
    } else {
      s.offered += 1;
    }
    sold.set(t.sessionId, s);
  }

  const rows: SuisaRow[] = [...sessions]
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map((session) => {
      const s = sold.get(session.sessionId) ?? { paid: 0, offered: 0, cents: 0 };
      const doorTickets = session.doorTickets ?? 0;
      const doorCents = session.doorRevenueCents ?? 0;
      const grossCents = s.cents + doorCents;
      const baseCents = withoutVat(grossCents, vatPercent);
      return {
        sessionId: session.sessionId,
        eventId: session.eventId,
        eventTitle: session.eventTitle,
        startsAt: session.startsAt,
        venue: session.venue,
        capacity: session.capacity,
        music: session.music,
        paid: s.paid,
        offered: s.offered,
        ticketickCents: s.cents,
        doorTickets,
        doorCents,
        paidTotal: s.paid + doorTickets,
        tickets: s.paid + s.offered + doorTickets,
        grossCents,
        baseCents,
        pending: pending.get(session.sessionId) ?? 0,
        large:
          (session.capacity ?? 0) >= LARGE_CONCERT_CAPACITY ||
          baseCents > LARGE_CONCERT_REVENUE_CENTS,
      };
    });

  const sum = (list: SuisaRow[]) =>
    list.reduce<SuisaFigures & { sessions: number }>(
      (acc, r) => {
        const out = { ...acc, sessions: acc.sessions + 1 };
        for (const key of Object.keys(ZERO) as (keyof SuisaFigures)[]) out[key] += r[key];
        return out;
      },
      { ...ZERO, sessions: 0 },
    );

  const concerts = rows.filter((r) => r.music !== "NONE");
  return {
    rows,
    totals: sum(concerts),
    protectedTotals: sum(concerts.filter((r) => r.music === "PROTECTED")),
    unmarked: concerts.filter((r) => r.music === null).length,
  };
}

/**
 * Part de chaque billet dans l'encaissé d'une commande du guichet.
 *
 * Le guichet de l'admin enregistre le montant réellement reçu (`totalCents`),
 * qui peut différer des prix des tarifs : il est réparti au prorata de la
 * valeur de chaque billet, ou à parts égales si elles sont toutes nulles.
 */
export function spreadOrderTotal(totalCents: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (sum > 0 ? (totalCents * w) / sum : totalCents / weights.length));
  const shares = raw.map(Math.floor);
  // Les centimes restants vont aux plus grosses fractions : le total tombe juste.
  let rest = totalCents - shares.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (rest <= 0) break;
    shares[i]! += 1;
    rest -= 1;
  }
  return shares;
}

/** Ligne du tableur, séparateur « ; » et montants à deux décimales pour Excel suisse. */
export function csvLine(cells: (string | number)[]): string {
  return cells
    .map((c) => {
      const text = String(c);
      return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    })
    .join(";");
}

export function csvAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}
