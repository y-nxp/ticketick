/**
 * Décision commune à tous les encaissements carte : PostFinance, Stripe, ou
 * simulation explicite. L'absence de prestataire ne doit jamais offrir des
 * billets : sans `ALLOW_MOCK_PAYMENTS=true`, le paiement échoue.
 */

export function mockPaymentsAllowed(): boolean {
  return process.env.ALLOW_MOCK_PAYMENTS === "true";
}

/** Levée quand aucun moyen d'encaisser n'est configuré. */
export class PaymentNotConfiguredError extends Error {
  constructor() {
    super(
      "Aucun encaissement configuré (PF_CHECKOUT_* manquant).",
    );
    this.name = "PaymentNotConfiguredError";
  }
}
