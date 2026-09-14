import "server-only";

import { prisma } from "@/lib/prisma";
import { releaseStaleUnpaidCardOrders } from "./create-order";

export type AvailabilityLine = {
  ticketTypeId: string;
  quantity: number;
};

export type AvailabilityItem = {
  ticketTypeId: string;
  requested: number;
  remaining: number;
};

export type AvailabilityResult = {
  available: boolean;
  items: AvailabilityItem[];
};

/**
 * Indique si le panier est encore vendable, après avoir rendu les places
 * des commandes carte abandonnées (délai de 10 min).
 */
export async function checkLinesAvailability(
  lines: AvailabilityLine[],
): Promise<AvailabilityResult> {
  await releaseStaleUnpaidCardOrders();

  const merged = new Map<string, number>();
  for (const line of lines) {
    if (!line.ticketTypeId || !Number.isInteger(line.quantity) || line.quantity < 1) {
      continue;
    }
    merged.set(
      line.ticketTypeId,
      (merged.get(line.ticketTypeId) ?? 0) + Math.min(line.quantity, 100),
    );
  }

  const ids = [...merged.keys()];
  if (!ids.length) return { available: false, items: [] };

  const types = await prisma.ticketType.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      quantity: true,
      sold: true,
      session: {
        select: {
          id: true,
          startsAt: true,
          capacity: true,
          sold: true,
          status: true,
        },
      },
    },
  });
  const byId = new Map(types.map((tt) => [tt.id, tt]));
  const now = new Date();
  const items: AvailabilityItem[] = [];
  const demandBySession = new Map<string, number>();
  let available = true;

  for (const [id, requested] of merged) {
    const tt = byId.get(id);
    if (
      !tt ||
      tt.session.status === "CANCELLED" ||
      tt.session.status === "SOLD_OUT" ||
      tt.session.startsAt <= now
    ) {
      items.push({ ticketTypeId: id, requested, remaining: 0 });
      available = false;
      continue;
    }

    const resteTarif = Math.max(0, tt.quantity - tt.sold);
    items.push({ ticketTypeId: id, requested, remaining: resteTarif });
    if (resteTarif < requested) available = false;
    demandBySession.set(
      tt.session.id,
      (demandBySession.get(tt.session.id) ?? 0) + requested,
    );
  }

  for (const tt of types) {
    if (tt.session.capacity == null) continue;
    const demande = demandBySession.get(tt.session.id) ?? 0;
    const resteJauge = Math.max(0, tt.session.capacity - tt.session.sold);
    if (demande > resteJauge) {
      available = false;
      for (const item of items) {
        const type = byId.get(item.ticketTypeId);
        if (type?.session.id === tt.session.id) {
          item.remaining = Math.min(item.remaining, resteJauge);
        }
      }
    }
  }

  return { available, items };
}
