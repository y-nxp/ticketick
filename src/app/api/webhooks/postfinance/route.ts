import { NextResponse } from "next/server";
import { isPostfinanceConfigured } from "@/lib/payment/postfinance";
import { settlePostfinanceById } from "@/lib/orders/settle-card";

/**
 * Webhook PostFinance Checkout.
 *
 * Dans le portail : Espace → Webhooks → URL
 *   https://ticketick.ch/api/webhooks/postfinance
 * Listener : nom `pf_paid` (commun à tous les clients), entité
 * Transaction, états AUTHORIZED / COMPLETED / FULFILL.
 * Le spectacle se distingue ensuite par la référence
 * `{slug}:{commande}`, pas par le nom du listener.
 *
 * Le montant et l'état sont relus via l'API : le corps n'est pas une preuve.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isPostfinanceConfigured()) {
    return NextResponse.json(
      { error: "postfinance_not_configured" },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null);
  const transactionId = readEntityId(body);
  if (transactionId == null) {
    return NextResponse.json({ received: true });
  }

  try {
    await settlePostfinanceById(transactionId);
  } catch (error) {
    console.error("[postfinance] webhook", error);
    return NextResponse.json({ error: "settle_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

function readEntityId(body: unknown): number | undefined {
  if (!body || typeof body !== "object") return undefined;
  const record = body as Record<string, unknown>;
  const raw =
    record.entityId ??
    record.entity_id ??
    (record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>).entityId
      : undefined);
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}
