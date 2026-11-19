/**
 * Lien de Collect for Stripe : ticketick prépare la vente, Collect encaisse
 * sur le lecteur (WisePad) et renvoie vers ticketick avec le résultat.
 *
 * https://docs.collectforstripe.com/api/charges : `amount` en centimes,
 * `description` reprise sur le paiement Stripe, `callback` appelé après
 * l'encaissement avec `result`, `finalAmount` et `chargeId`. La monnaie est
 * celle choisie dans les réglages de Collect.
 */

export const COLLECT_LAUNCH_URL = "https://app.collectforstripe.com/launchApp";

/** Description Stripe du paiement, limitée comme Stripe l'accepte. */
export function saleDescription(input: {
  organizer: string;
  when: string;
  title: string;
  lines: { quantity: number; tariff: string }[];
}): string {
  const lines = input.lines.map((l) => `${l.quantity}× ${l.tariff}`).join(", ");
  const text = `${input.organizer} · ${input.when} · ${input.title} · ${lines}`.replace(/\s+/g, " ").trim();
  return text.length <= 1000 ? text : `${text.slice(0, 999)}…`;
}

export function collectLaunchUrl(input: {
  amountCents: number;
  description: string;
  callback: string;
}): string {
  const query = new URLSearchParams({
    action: "beginTransaction",
    amount: String(input.amountCents),
    description: input.description,
    callback: input.callback,
  });
  return `${COLLECT_LAUNCH_URL}?${query}`;
}

export type CollectReturn =
  | { result: "success"; chargeId: string; finalAmount: string | null }
  | { result: "fail" };

/** Paramètres ajoutés par Collect à l'adresse de retour. */
export function readCollectReturn(query: Record<string, string | string[] | undefined>): CollectReturn {
  const one = (key: string) => {
    const value = query[key];
    return typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
  };
  const chargeId = one("chargeId");
  if (one("result") === "success" && chargeId && /^(ch|py|pi)_[A-Za-z0-9]+$/.test(chargeId)) {
    return { result: "success", chargeId, finalAmount: one("finalAmount") ?? null };
  }
  return { result: "fail" };
}
