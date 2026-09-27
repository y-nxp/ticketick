"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { catalogActor, forbidIfForeignEvent } from "@/lib/admin/access";
import { failure, success, type FormState } from "@/lib/admin/form";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  eventId: z.string().min(1),
  sessionId: z.string().min(1),
  keys: z.array(z.string().min(1).max(40)).min(1).max(400),
  block: z.boolean(),
  note: z.string().trim().max(200),
});

/**
 * Bloque ou libère des places (invités, régie, artistes). Seules les places
 * libres se bloquent et seules les places bloquées se libèrent : une place
 * vendue ne change jamais d'état depuis cet écran.
 */
export async function setSeatsBlocked(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { organizerId } = await catalogActor();

  let keys: unknown;
  try {
    keys = JSON.parse(String(formData.get("keys") ?? "[]"));
  } catch {
    return failure("invalid");
  }
  const parsed = schema.safeParse({
    eventId: formData.get("eventId"),
    sessionId: formData.get("sessionId"),
    keys,
    block: formData.get("block") === "1",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return failure("invalid");
  const data = parsed.data;

  await forbidIfForeignEvent(data.eventId, organizerId);
  const session = await prisma.eventSession.findFirst({
    where: { id: data.sessionId, eventId: data.eventId },
    select: { id: true },
  });
  if (!session) return failure("notFound");

  const { count } = await prisma.sessionSeat.updateMany({
    where: {
      sessionId: session.id,
      seatKey: { in: data.keys },
      status: data.block ? "AVAILABLE" : "BLOCKED",
    },
    data: data.block
      ? { status: "BLOCKED", blockNote: data.note || null }
      : { status: "AVAILABLE", blockNote: null },
  });

  revalidatePath(`/admin/events/${data.eventId}/seats/${session.id}`);
  return success(String(count));
}
