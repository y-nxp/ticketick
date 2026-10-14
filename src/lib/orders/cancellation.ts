export type CancellationCase = "refund" | "noRefund" | "free" | "unpaid";

/**
 * Ce que l'e-mail d'annulation annonce pour les billets choisis : un
 * remboursement en cours, des billets payés non remboursés, des billets
 * gratuits, ou des billets jamais réglés (réservation, lien non payé).
 */
export function cancellationOutcome(input: {
  tickets: { id: string; priceCents: number }[];
  payment: { status: string; amountCents: number } | null;
  charges: {
    kind: "PAYMENT" | "REFUND";
    status: string;
    amountCents: number;
    ticketIds: string[];
  }[];
}): { case: CancellationCase; refundCents: number } {
  const ids = new Set(input.tickets.map((t) => t.id));
  const charges = input.charges.filter((c) => c.status !== "CANCELLED");
  const payments = charges.filter((c) => c.kind === "PAYMENT");
  const paymentFor = (id: string) => payments.find((c) => c.ticketIds.includes(id));
  const originallyPaid =
    (input.payment?.status === "COMPLETED" || input.payment?.status === "REFUNDED") &&
    input.payment.amountCents > 0;

  const paid = input.tickets.some((ticket) => {
    if (ticket.priceCents <= 0) return false;
    const charge = paymentFor(ticket.id);
    return charge ? charge.status === "DONE" && charge.amountCents > 0 : originallyPaid;
  });
  // Remboursement intégral chez le prestataire : il couvre les billets d'origine.
  const providerRefund =
    input.payment?.status === "REFUNDED" && input.tickets.some((t) => !paymentFor(t.id))
      ? input.payment.amountCents
      : 0;
  const refundCents =
    charges
      .filter((c) => c.kind === "REFUND" && c.ticketIds.some((id) => ids.has(id)))
      .reduce((sum, c) => sum + c.amountCents, 0) + providerRefund;

  if (refundCents > 0) return { case: "refund", refundCents };
  if (paid) return { case: "noRefund", refundCents: 0 };
  if (input.tickets.every((t) => t.priceCents <= 0)) return { case: "free", refundCents: 0 };
  return { case: "unpaid", refundCents: 0 };
}
