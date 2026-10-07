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
