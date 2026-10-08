"use server";

import * as z from "zod";
import { sendPaidOrderTickets } from "@/lib/email/ticket-mail";
import { payPath } from "./charges";
import { applySeatChange, type ChangeError } from "./seat-change";

const movesSchema = z
  .array(z.object({ ticketId: z.string().min(1).max(40), to: z.string().min(1).max(40) }))
  .min(1)
  .max(50);

export type ConfirmChangeState =
  | { ok: true; kind: "done" }
  | { ok: true; kind: "pay"; url: string }
  | { ok: false; error: ChangeError | "invalid" };

export async function confirmSeatChangeAction(
  token: string,
  moves: { ticketId: string; to: string }[],
): Promise<ConfirmChangeState> {
  const parsed = movesSchema.safeParse(moves);
  if (!parsed.success || typeof token !== "string") return { ok: false, error: "invalid" };
  const result = await applySeatChange({ token, moves: parsed.data });
  if (!result.ok) return { ok: false, error: result.error };
  if (result.kind === "pay") {
    return { ok: true, kind: "pay", url: payPath(result.payToken, result.locale) };
  }
  await sendPaidOrderTickets(result.orderId).catch((error) => {
    console.error("[changement] envoi des billets", error);
  });
  return { ok: true, kind: "done" };
}
