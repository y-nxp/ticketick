import { NextResponse } from "next/server";
import { sendPreviewTicketEmail } from "@/lib/email/ticket-mail";

/**
 * Envoi d'un billet d'aperçu. Appelé depuis le serveur (AUTH_SECRET),
 * jamais exposé au public.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const attendu = process.env.AUTH_SECRET?.trim();
  const recu = request.headers.get("x-ticketick-preview")?.trim();
  if (!attendu || recu !== attendu) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { to?: string } | null;
  const to = body?.to?.trim() || "info@ticketick.ch";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json({ error: "invalid_to" }, { status: 400 });
  }

  const sent = await sendPreviewTicketEmail(to);
  return NextResponse.json(sent);
}
