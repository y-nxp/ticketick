import "server-only";

import { readLines } from "@/lib/door/sale";
import { prisma } from "@/lib/prisma";
import { t as translate, type Translated } from "@/lib/types";
import { summarizeTill, type TillSummary } from "./till-summary";

/** Concert ayant des ventes à la caisse, pour le choix du rapport. */
export interface TillSessionRow {
  id: string;
  title: string;
  startsAt: Date;
  sales: number;
  cents: number;
}

/** Concerts de l'organisateur avec des ventes à la caisse, les plus récents d'abord. */
export async function getTillSessions(organizerId: string, locale: string): Promise<TillSessionRow[]> {
  const groups = await prisma.doorSale.groupBy({
    by: ["sessionId"],
    where: { session: { event: { organizerId } } },
    _count: { _all: true },
    _sum: { amountCents: true },
  });
  if (groups.length === 0) return [];
  const sessions = await prisma.eventSession.findMany({
    where: { id: { in: groups.map((g) => g.sessionId) } },
    orderBy: { startsAt: "desc" },
    select: { id: true, startsAt: true, label: true, event: { select: { title: true } } },
  });
  const bySession = new Map(groups.map((g) => [g.sessionId, g]));
  return sessions.map((s) => {
    const title = translate(s.event.title as Translated, locale);
    const label = s.label ? translate(s.label as Translated, locale) : null;
    const g = bySession.get(s.id);
    return {
      id: s.id,
      title: label ? `${title} (${label})` : title,
      startsAt: s.startsAt,
      sales: g?._count._all ?? 0,
      cents: g?._sum.amountCents ?? 0,
    };
  });
}

export interface TillSaleRow {
  id: string;
  at: Date;
  provider: string;
  amountCents: number;
  seller: string;
  lines: { name: string; quantity: number; unitPriceCents: number }[];
}

/** Rapport complet d'un concert : totaux par moyen, par tarif, par vendeur, et chaque vente. */
export async function getTillReport(
  organizerId: string,
  sessionId: string,
): Promise<{ summary: TillSummary; sales: TillSaleRow[] } | null> {
  const owned = await prisma.eventSession.count({ where: { id: sessionId, event: { organizerId } } });
  if (owned === 0) return null;
  const rows = await prisma.doorSale.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      provider: true,
      amountCents: true,
      lines: true,
      soldById: true,
      soldBy: { select: { name: true, email: true } },
    },
  });
  const sales = rows.map((r) => ({
    id: r.id,
    at: r.createdAt,
    provider: r.provider,
    amountCents: r.amountCents,
    sellerId: r.soldById,
    seller: r.soldBy ? (r.soldBy.name?.trim() || r.soldBy.email) : "—",
    lines: readLines(r.lines).map((l) => ({ name: l.name, quantity: l.quantity, unitPriceCents: l.unitPriceCents })),
  }));
  return {
    summary: summarizeTill(sales.map((s) => ({ ...s, sellerName: s.seller }))),
    sales: sales.map((s) => ({ id: s.id, at: s.at, provider: s.provider, amountCents: s.amountCents, seller: s.seller, lines: s.lines })),
  };
}
