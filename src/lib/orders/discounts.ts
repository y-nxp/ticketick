import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Rabais automatiques (sans code).
 *
 * Seule la forme « N séances payantes distinctes chez un organisateur,
 * éventuellement dans un même lieu » est gérée : le multi-concerts du
 * Gstaad New Year Music Festival (-15 % dès 3 concerts à Rougemont).
 * Le montant n'est calculé que sur les billets qui comptent.
 */

export interface DiscountLine {
  quantity: number;
  unitPriceCents: number;
  sessionId: string;
  venueId: string | null;
  organizerId: string;
}

export interface AppliedDiscount {
  discountId: string;
  label: unknown;
  amountCents: number;
}

/** Arrondi aux 5 centimes, comme un montant en francs suisses. */
function roundTo5(cents: number): number {
  return Math.round(cents / 5) * 5;
}

export async function resolveAutoDiscounts(
  lines: DiscountLine[],
  now: Date = new Date(),
): Promise<AppliedDiscount[]> {
  const organizerIds = [...new Set(lines.map((l) => l.organizerId))];
  if (organizerIds.length === 0) return [];

  const discounts = await prisma.discount.findMany({
    where: {
      active: true,
      code: null,
      organizerId: { in: organizerIds },
      minDistinctSessions: { not: null },
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
        { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  const ticketTotal = lines.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0);
  const applied: AppliedDiscount[] = [];
  let remaining = ticketTotal;

  for (const d of discounts) {
    if (d.maxRedemptions != null && d.redemptions >= d.maxRedemptions) continue;
    const qualifying = lines.filter(
      (l) =>
        l.unitPriceCents > 0 &&
        l.organizerId === d.organizerId &&
        (d.venueId == null || l.venueId === d.venueId),
    );
    const sessions = new Set(qualifying.map((l) => l.sessionId));
    if (sessions.size < (d.minDistinctSessions ?? 0)) continue;

    const base = qualifying.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0);
    if (d.minAmountCents != null && base < d.minAmountCents) continue;
    const raw =
      d.type === "PERCENTAGE"
        ? roundTo5((base * d.value) / 10_000)
        : Math.min(d.value, base);
    const amountCents = Math.min(raw, remaining);
    if (amountCents <= 0) continue;
    remaining -= amountCents;
    applied.push({ discountId: d.id, label: d.label, amountCents });
  }
  return applied;
}

export interface DiscountPreview {
  amountCents: number;
  labels: string[];
}

/** Même calcul que la commande, d'après les tarifs en base. */
export async function previewDiscounts(
  lines: { ticketTypeId: string; quantity: number }[],
  locale: string,
): Promise<DiscountPreview> {
  const ids = [...new Set(lines.map((l) => l.ticketTypeId))];
  if (ids.length === 0) return { amountCents: 0, labels: [] };
  const types = await prisma.ticketType.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      priceCents: true,
      session: {
        select: { id: true, venueId: true, event: { select: { organizerId: true } } },
      },
    },
  });
  const byId = new Map(types.map((t) => [t.id, t]));
  const discountLines: DiscountLine[] = [];
  for (const line of lines) {
    const tt = byId.get(line.ticketTypeId);
    if (!tt || !Number.isInteger(line.quantity) || line.quantity < 1) continue;
    discountLines.push({
      quantity: Math.min(line.quantity, 100),
      unitPriceCents: tt.priceCents,
      sessionId: tt.session.id,
      venueId: tt.session.venueId,
      organizerId: tt.session.event.organizerId,
    });
  }
  const applied = await resolveAutoDiscounts(discountLines);
  return {
    amountCents: applied.reduce((s, d) => s + d.amountCents, 0),
    labels: applied.map((d) => {
      const label = d.label as Record<string, string> | null;
      return label?.[locale] ?? label?.fr ?? "";
    }),
  };
}
