import { NextResponse } from "next/server";
import * as z from "zod";
import {
  createCheckoutHold,
  releaseOrderByReference,
  releaseStaleUnpaidCardOrders,
} from "@/lib/orders/create-order";
import { reservedUntilFrom } from "@/lib/orders/reservation";

const lineSchema = z.object({
  ticketTypeId: z.string().min(1),
  quantity: z.number().int().positive().max(100),
});

const holdSchema = z.object({
  locale: z.string().max(5).default("fr"),
  lines: z.array(lineSchema).min(1).max(50),
  replaceReference: z.string().min(3).max(32).optional(),
});

/**
 * Retient le stock dès l'arrivée sur /checkout, avant les coordonnées.
 * Le chrono de 25 min commence ici — pas à l'ajout au panier.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = holdSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const data = parsed.data;

  await releaseStaleUnpaidCardOrders().catch((error) => {
    console.error("[hold] nettoyage des commandes périmées", error);
  });

  if (data.replaceReference) {
    await releaseOrderByReference(data.replaceReference).catch((error) => {
      console.error("[hold] libération de l'ancienne rétention", error);
    });
  }

  const created = await createCheckoutHold({
    lines: data.lines,
    locale: data.locale,
  });

  if (!created.ok) {
    return NextResponse.json(
      { error: created.error, ticketTypeId: created.ticketTypeId },
      { status: 409 },
    );
  }

  return NextResponse.json({
    reference: created.order.reference,
    reservedUntil: reservedUntilFrom(created.order.createdAt).toISOString(),
  });
}
