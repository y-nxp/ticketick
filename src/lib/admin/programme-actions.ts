"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { catalogActor, assertEventOwned } from "@/lib/admin/access";
import { payUrlFor, sendProgrammeLinkEmail } from "@/lib/email/charge-mail";
import { createProgrammeLink, programmeBuyers } from "@/lib/orders/programme";
import { changePath } from "@/lib/orders/seat-change";
import { endOfDayZurich } from "@/lib/orders/self-service-rules";
import { prisma } from "@/lib/prisma";

export type ProgrammeSendState =
  | { ok: true; test: true; to: string }
  | { ok: true; test: false; sent: number; failed: string[] }
  | { ok: false; error: string }
  | undefined;

const schema = z.object({
  eventId: z.string().min(1).max(40),
  sessionId: z.string().min(1).max(40),
  orders: z.array(z.string().min(1).max(40)).max(2000),
  messageFr: z.string().max(8000),
  messageEn: z.string().max(8000),
  until: z.string().max(10),
  test: z.boolean(),
});

/**
 * Programme modifié : un lien de choix (garder, annuler, échanger) à chaque
 * acheteur coché de la séance. En essai, un seul e-mail, à l'adresse de
 * l'organisateur connecté, avec un lien factice.
 */
export async function sendProgrammeLinksAction(
  _prev: ProgrammeSendState,
  formData: FormData,
): Promise<ProgrammeSendState> {
  const parsed = schema.safeParse({
    eventId: formData.get("eventId"),
    sessionId: formData.get("sessionId"),
    orders: formData.getAll("order").filter((v) => typeof v === "string"),
    messageFr: formData.get("messageFr") ?? "",
    messageEn: formData.get("messageEn") ?? "",
    until: formData.get("until") ?? "",
    test: formData.get("intent") === "test",
  });
  if (!parsed.success) return { ok: false, error: "invalid" };
  const input = parsed.data;
  const { user, organizerId } = await catalogActor();
  if (!(await assertEventOwned(input.eventId, organizerId))) return { ok: false, error: "notFound" };
  const session = await prisma.eventSession.findFirst({
    where: { id: input.sessionId, eventId: input.eventId },
    select: { startsAt: true },
  });
  if (!session) return { ok: false, error: "notFound" };
  if (input.orders.length === 0) return { ok: false, error: "noneSelected" };

  const until = endOfDayZurich(input.until);
  if (!until || until <= new Date()) return { ok: false, error: "untilPast" };
  const expiresAt = until < session.startsAt ? until : session.startsAt;

  // Seuls les acheteurs de cette séance : un identifiant glissé dans le formulaire ne passe pas.
  const buyers = new Map((await programmeBuyers(input.sessionId)).map((b) => [b.orderId, b]));
  const chosen = [...new Set(input.orders)].filter((id) => {
    const buyer = buyers.get(id);
    return buyer && !buyer.reseller && buyer.email;
  });
  if (chosen.length === 0) return { ok: false, error: "noneSelected" };
  const messages = { fr: input.messageFr, en: input.messageEn };

  if (input.test) {
    // Les deux versions, française puis anglaise, à l'adresse de l'organisateur connecté.
    const results = await Promise.all(
      (["fr", "en"] as const).map((forceLocale) =>
        sendProgrammeLinkEmail({
          orderId: chosen[0]!,
          sessionId: input.sessionId,
          url: payUrlFor(changePath("essai", forceLocale)),
          expiresAt,
          messages,
          testTo: user.email,
          forceLocale,
        }),
      ),
    );
    return results.every((r) => r.sent)
      ? { ok: true, test: true, to: user.email }
      : { ok: false, error: "testFailed" };
  }

  let sent = 0;
  const failed: string[] = [];
  for (const orderId of chosen) {
    const buyer = buyers.get(orderId)!;
    const link = await createProgrammeLink({
      orderId,
      sessionId: input.sessionId,
      actorId: user.id,
      until: expiresAt,
    });
    if (!link.ok) {
      failed.push(buyer.reference);
      continue;
    }
    const mail = await sendProgrammeLinkEmail({
      orderId,
      sessionId: input.sessionId,
      url: payUrlFor(changePath(link.token, buyer.locale)),
      expiresAt: link.expiresAt,
      messages,
    }).catch((error) => {
      console.error("[programme] envoi", buyer.reference, error);
      return { sent: false };
    });
    if (mail.sent) sent++;
    else failed.push(buyer.reference);
  }
  revalidatePath(`/admin/events/${input.eventId}/programme/${input.sessionId}`);
  return { ok: true, test: false, sent, failed };
}
