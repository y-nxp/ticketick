import { NextResponse } from "next/server";
import * as z from "zod";
import { releaseHeldOrder } from "@/lib/orders/create-order";
import { clientIpFrom, consume } from "@/lib/rate-limit";

const releaseSchema = z.object({
  reference: z.string().min(3).max(32),
  token: z.string().min(16).max(64),
});

/**
 * Rend une rétention avant son terme, quand l'acheteur quitte /checkout sans
 * payer. Appelée en `keepalive` à la fermeture de la page : la réponse n'est
 * jamais lue. Sans cet appel, la place resterait grise 25 minutes pour les
 * autres acheteurs.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = releaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!consume(`hold-release:${clientIpFrom(request.headers)}`, 40, 10 * 60_000)) {
    return NextResponse.json({ error: "throttled" }, { status: 429 });
  }
  await releaseHeldOrder(parsed.data.reference, parsed.data.token).catch((error) => {
    console.error("[hold] libération anticipée", error);
  });
  return new NextResponse(null, { status: 204 });
}
