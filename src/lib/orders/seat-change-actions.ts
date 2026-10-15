"use server";

import * as z from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { sendCancellationEmail } from "@/lib/email/charge-mail";
import { sendPaidOrderTickets } from "@/lib/email/ticket-mail";
import type { ChangeAccess } from "./change-access";
import { payPath } from "./charges";
import { applyExchange, cancelFreeTickets, type ExchangeError } from "./exchange";
import { applySeatChange, type ChangeError } from "./seat-change";

/** Ce que la page transmet : le jeton du lien, ou la commande du compte connecté. */
export type ClientAccess = { token: string } | { orderId: string };

const id = z.string().min(1).max(100);
const accessSchema = z.union([z.object({ token: id }), z.object({ orderId: id })]);

async function serverAccess(input: unknown): Promise<ChangeAccess | null> {
  const parsed = accessSchema.safeParse(input);
  if (!parsed.success) return null;
  if ("token" in parsed.data) return { token: parsed.data.token };
  const user = await getCurrentUser();
  if (!user) return null;
  return { userId: user.id, orderId: parsed.data.orderId };
}

const movesSchema = z
  .array(z.object({ ticketId: z.string().min(1).max(40), to: z.string().min(1).max(40) }))
  .min(1)
  .max(50);

export type ConfirmChangeState =
  | { ok: true; kind: "done" }
  | { ok: true; kind: "pay"; url: string }
  | { ok: false; error: ChangeError | "invalid" };

async function sendNewTickets(orderId: string) {
  await sendPaidOrderTickets(orderId).catch((error) => {
    console.error("[changement] envoi des billets", error);
  });
}

export async function confirmSeatChangeAction(
  clientAccess: ClientAccess,
  moves: { ticketId: string; to: string }[],
): Promise<ConfirmChangeState> {
  const access = await serverAccess(clientAccess);
  const parsed = movesSchema.safeParse(moves);
  if (!access || !parsed.success) return { ok: false, error: "invalid" };
  const result = await applySeatChange({ access, moves: parsed.data });
  if (!result.ok) return { ok: false, error: result.error };
  if (result.kind === "pay") {
    return { ok: true, kind: "pay", url: payPath(result.payToken, result.locale) };
  }
  await sendNewTickets(result.orderId);
  return { ok: true, kind: "done" };
}

const exchangeSchema = z.object({
  give: z.array(z.string().min(1).max(40)).max(50),
  items: z
    .array(
      z.object({
        sessionId: z.string().min(1).max(40),
        lines: z
          .array(
            z.object({
              ticketTypeId: z.string().min(1).max(40),
              quantity: z.number().int().min(0).max(50),
              seatKeys: z.array(z.string().min(1).max(40)).max(50).optional(),
            }),
          )
          .min(1)
          .max(20),
      }),
    )
    .min(1)
    .max(20),
});

export type ExchangeState =
  | { ok: true; kind: "done" }
  | { ok: true; kind: "pay"; url: string }
  | { ok: false; error: ExchangeError | "invalid"; ticketTypeId?: string };

export async function confirmExchangeAction(
  clientAccess: ClientAccess,
  input: z.infer<typeof exchangeSchema>,
): Promise<ExchangeState> {
  const access = await serverAccess(clientAccess);
  const parsed = exchangeSchema.safeParse(input);
  if (!access || !parsed.success) return { ok: false, error: "invalid" };
  const result = await applyExchange({ access, ...parsed.data });
  if (!result.ok) return result;
  if (result.kind === "pay") {
    return { ok: true, kind: "pay", url: payPath(result.payToken, result.locale) };
  }
  await sendNewTickets(result.orderId);
  return { ok: true, kind: "done" };
}

export type CancelFreeState = { ok: true } | { ok: false; error: string };

export async function cancelFreeTicketsAction(
  orderId: string,
  ticketIds: string[],
): Promise<CancelFreeState> {
  const user = await getCurrentUser();
  const ids = z.array(z.string().min(1).max(40)).min(1).max(50).safeParse(ticketIds);
  if (!user || !id.safeParse(orderId).success || !ids.success) {
    return { ok: false, error: "invalid" };
  }
  const result = await cancelFreeTickets({ userId: user.id, orderId, ticketIds: ids.data });
  if (!result.ok) return result;
  await sendCancellationEmail({ orderId, ticketIds: ids.data }).catch((error) => {
    console.error("[annulation] courriel", error);
  });
  return { ok: true };
}
