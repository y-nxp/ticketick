import type { CommissionKind } from "@prisma/client";

export interface CommissionRule {
  kind: CommissionKind;
  /** Pourcentage en points de base (250 = 2,50 %). */
  bps: number;
  /** Montant par billet payant. */
  fixedCents: number;
}

/** Règle d'un spectacle attribué : la sienne si elle est fixée, sinon celle du point de vente. */
export function commissionRule(
  reseller: { commissionKind: CommissionKind; commissionBps: number; commissionFixedCents: number },
  assignment?: {
    commissionKind: CommissionKind | null;
    commissionBps: number | null;
    commissionFixedCents: number | null;
  } | null,
): CommissionRule {
  if (assignment?.commissionKind) {
    return {
      kind: assignment.commissionKind,
      bps: assignment.commissionBps ?? 0,
      fixedCents: assignment.commissionFixedCents ?? 0,
    };
  }
  return {
    kind: reseller.commissionKind,
    bps: reseller.commissionBps,
    fixedCents: reseller.commissionFixedCents,
  };
}

export function commissionCents(
  rule: CommissionRule,
  sale: { amountCents: number; paidTickets: number },
): number {
  if (rule.kind === "FIXED_PER_TICKET") return rule.fixedCents * sale.paidTickets;
  return Math.round((sale.amountCents * rule.bps) / 10_000);
}

/** « 2,5 % » ou « 2.00 CHF / billet », selon la règle. */
export function describeRule(
  rule: CommissionRule,
  locale: string,
  format: (cents: number) => string,
  perTicket: (amount: string) => string,
): string {
  if (rule.kind === "FIXED_PER_TICKET") return perTicket(format(rule.fixedCents));
  return `${(rule.bps / 100).toLocaleString(locale, { maximumFractionDigits: 2 })} %`;
}

/**
 * Commission reprise quand des billets d'une vente sont annulés : la part des
 * billets retirés dans ce qui restait de la vente, selon la règle (montant
 * pour un pourcentage, nombre de billets payants pour un montant fixe). Tout
 * retirer reprend toute la commission restante, sans reste d'arrondi.
 */
export function commissionReturned(
  kind: CommissionKind,
  remainingCents: number,
  before: { amountCents: number; paidTickets: number },
  removed: { amountCents: number; paidTickets: number },
): number {
  const [part, whole] =
    kind === "FIXED_PER_TICKET"
      ? [removed.paidTickets, before.paidTickets]
      : [removed.amountCents, before.amountCents];
  if (remainingCents <= 0 || part <= 0 || whole <= 0) return 0;
  if (part >= whole) return remainingCents;
  return Math.min(remainingCents, Math.round((remainingCents * part) / whole));
}
