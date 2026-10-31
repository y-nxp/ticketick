import "server-only";

import { prisma } from "@/lib/prisma";
import {
  computeDiscounts,
  type EngineApplied,
  type EngineDiscount,
  type EngineLine,
} from "./discount-engine";

/**
 * Rabais automatiques (sans code) : lecture en base, puis calcul par
 * `discount-engine` (multi-séances ou remise de groupe, sans cumul).
 */

export interface DiscountLine {
  ticketTypeId: string;
  quantity: number;
  /** Prix unitaire retenu par la commande ; celui du tarif sinon. */
  unitPriceCents?: number;
  /** Places numérotées : sert à connaître le plein tarif d'une gratuité. */
  seats?: string[];
}

export type AppliedDiscount = EngineApplied;

export interface ResolvedDiscounts {
  applied: AppliedDiscount[];
  /** Part du rabais portée par chaque ligne, dans l'ordre reçu. */
  perLine: number[];
  totalCents: number;
}

const NONE: ResolvedDiscounts = { applied: [], perLine: [], totalCents: 0 };

export async function resolveAutoDiscounts(
  lines: DiscountLine[],
  now: Date = new Date(),
): Promise<ResolvedDiscounts> {
  if (lines.length === 0) return NONE;
  const ids = [...new Set(lines.map((l) => l.ticketTypeId))];
  const types = await prisma.ticketType.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      priceCents: true,
      maxPerPaidTicket: true,
      companionOfId: true,
      seatZones: true,
      session: {
        select: {
          id: true,
          venueId: true,
          event: { select: { id: true, organizerId: true, groupDiscountOff: true } },
        },
      },
    },
  });
  const byId = new Map(types.map((t) => [t.id, t]));
  const organizerIds = [...new Set(types.map((t) => t.session.event.organizerId))];
  if (organizerIds.length === 0) return { ...NONE, perLine: lines.map(() => 0) };

  const rows = await prisma.discount.findMany({
    where: {
      active: true,
      code: null,
      organizerId: { in: organizerIds },
      OR: [
        { scope: "ORDER", minDistinctSessions: { not: null } },
        { scope: "EVENT", minQuantity: { not: null } },
      ],
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
        { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
  const discounts: EngineDiscount[] = rows.map((d) => ({
    id: d.id,
    label: d.label,
    kind: d.scope === "EVENT" ? "group" : "sessions",
    type: d.type,
    value: d.value,
    organizerId: d.organizerId,
    venueId: d.venueId,
    minDistinctSessions: d.minDistinctSessions,
    minQuantity: d.minQuantity,
    minAmountCents: d.minAmountCents,
    maxRedemptions: d.maxRedemptions,
    redemptions: d.redemptions,
  }));
  const hasGroup = discounts.some((d) => d.kind === "group");

  // Plein tarif des gratuités accompagnantes : seulement utile s'il y a une
  // remise de groupe à comparer (elles ne s'y cumulent pas).
  const companionLines = lines.filter((l) => {
    const tt = byId.get(l.ticketTypeId);
    return tt && tt.maxPerPaidTicket != null && (l.unitPriceCents ?? tt.priceCents) === 0;
  });
  const regular =
    hasGroup && companionLines.length
      ? await regularPrices(companionLines, byId)
      : new Map<DiscountLine, number[]>();

  const engineLines: EngineLine[] = [];
  const kept: number[] = [];
  lines.forEach((line, index) => {
    const tt = byId.get(line.ticketTypeId);
    if (!tt || !Number.isInteger(line.quantity) || line.quantity < 1) return;
    kept.push(index);
    engineLines.push({
      quantity: Math.min(line.quantity, 100),
      unitPriceCents: line.unitPriceCents ?? tt.priceCents,
      sessionId: tt.session.id,
      eventId: tt.session.event.id,
      venueId: tt.session.venueId,
      organizerId: tt.session.event.organizerId,
      groupDiscountOff: tt.session.event.groupDiscountOff,
      ...(regular.has(line) ? { companionRegularCents: regular.get(line) } : {}),
    });
  });

  const result = computeDiscounts(engineLines, discounts);
  const perLine = lines.map(() => 0);
  kept.forEach((index, k) => {
    perLine[index] = result.perLine[k];
  });
  return { applied: result.applied, perLine, totalCents: result.totalCents };
}

/**
 * Prix qu'aurait chaque place d'une gratuité sans elle : le tarif source
 * désigné, sinon le moins cher des tarifs payants de la séance valables
 * dans la zone du siège (ou dans les zones de la gratuité, sans siège).
 */
async function regularPrices(
  lines: DiscountLine[],
  byId: Map<
    string,
    {
      companionOfId: string | null;
      seatZones: string[];
      session: { id: string };
    }
  >,
): Promise<Map<DiscountLine, number[]>> {
  const sessionIds = [...new Set(lines.map((l) => byId.get(l.ticketTypeId)!.session.id))];
  const [tariffs, seats] = await Promise.all([
    prisma.ticketType.findMany({
      where: { sessionId: { in: sessionIds }, priceCents: { gt: 0 }, maxPerPaidTicket: null },
      select: { id: true, sessionId: true, priceCents: true, seatZones: true },
    }),
    prisma.sessionSeat.findMany({
      where: {
        sessionId: { in: sessionIds },
        seatKey: { in: lines.flatMap((l) => l.seats ?? []) },
      },
      select: { sessionId: true, seatKey: true, zone: true },
    }),
  ]);
  const zoneOf = new Map(seats.map((s) => [`${s.sessionId}:${s.seatKey}`, s.zone]));
  const priceOf = new Map(tariffs.map((t) => [t.id, t.priceCents]));

  const cheapest = (sessionId: string, zones: string[]): number => {
    const fits = tariffs.filter(
      (t) =>
        t.sessionId === sessionId &&
        (zones.length === 0 || t.seatZones.length === 0 || t.seatZones.some((z) => zones.includes(z))),
    );
    return fits.length ? Math.min(...fits.map((t) => t.priceCents)) : 0;
  };

  const out = new Map<DiscountLine, number[]>();
  for (const line of lines) {
    const tt = byId.get(line.ticketTypeId)!;
    const sessionId = tt.session.id;
    const source = tt.companionOfId ? priceOf.get(tt.companionOfId) : undefined;
    const prices: number[] = [];
    for (let i = 0; i < Math.min(line.quantity, 100); i += 1) {
      const seat = line.seats?.[i];
      const zone = seat ? zoneOf.get(`${sessionId}:${seat}`) : undefined;
      prices.push(source ?? cheapest(sessionId, zone ? [zone] : tt.seatZones));
    }
    out.set(line, prices);
  }
  return out;
}

const WAIVED_NOTE: Record<string, string> = {
  fr: "billets gratuits comptés au plein tarif",
  en: "free tickets counted at full price",
  de: "Gratistickets zum vollen Preis gezählt",
  it: "biglietti gratuiti contati a prezzo pieno",
  es: "entradas gratuitas contadas a precio completo",
};

/** Libellé d'un rabais appliqué dans la langue de l'acheteur. */
export function appliedLabel(d: AppliedDiscount, locale: string): string {
  const label = d.label as Record<string, string> | null;
  const text = label?.[locale] || (locale === "es" ? label?.en : "") || label?.fr || "";
  return d.waivesCompanions ? `${text} (${WAIVED_NOTE[locale] ?? WAIVED_NOTE.fr})` : text;
}

export interface DiscountPreview {
  amountCents: number;
  labels: string[];
  /** Chaque rabais appliqué, avec son montant, pour le détail du panier. */
  items: { label: string; amountCents: number }[];
}

/** Même calcul que la commande, d'après les tarifs en base. */
export async function previewDiscounts(
  lines: { ticketTypeId: string; quantity: number; seats?: string[] }[],
  locale: string,
): Promise<DiscountPreview> {
  const clean = lines
    .filter((l) => typeof l.ticketTypeId === "string" && Number.isInteger(l.quantity))
    .map((l) => ({
      ticketTypeId: l.ticketTypeId,
      quantity: l.quantity,
      seats: Array.isArray(l.seats) ? l.seats.filter((s) => typeof s === "string").slice(0, 100) : undefined,
    }));
  const resolved = await resolveAutoDiscounts(clean);
  const items = resolved.applied.map((d) => ({
    label: appliedLabel(d, locale),
    amountCents: d.amountCents,
  }));
  return {
    amountCents: resolved.totalCents,
    labels: items.map((i) => i.label),
    items,
  };
}
