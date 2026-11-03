import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Chiffres de ticketick pour la console du groupe (Clouboard › Chiffres).
 * Lecture seule, `Authorization: Bearer $GROUP_FIGURES_TOKEN`. Contrat :
 * clouboard/docs/chiffres-groupe.md. Le revenu est ce que ticketick garde
 * (commission et frais) ; le volume des billets vendus est en complément.
 */
function tokenMatches(req: Request): boolean {
  const expected = process.env.GROUP_FIGURES_TOKEN?.trim();
  const header = req.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!expected || !given) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Organisateurs qui ont vendu au moins un billet depuis `since`. */
async function sellingOrganizers(since: Date): Promise<number> {
  const rows = await prisma.$queryRaw<{ c: number }[]>`
    SELECT count(DISTINCT e."organizerId")::int AS c
    FROM "Order" o
    JOIN "OrderItem" oi ON oi."orderId" = o.id
    JOIN "TicketType" tt ON tt.id = oi."ticketTypeId"
    JOIN "EventSession" s ON s.id = tt."sessionId"
    JOIN "Event" e ON e.id = s."eventId"
    WHERE o.status = 'PAID' AND o."createdAt" >= ${since}`;
  return rows[0]?.c ?? 0;
}

export async function GET(req: Request) {
  if (!process.env.GROUP_FIGURES_TOKEN?.trim()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  if (!tokenMatches(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86_400_000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const paidSince = (since: Date) =>
    prisma.order.aggregate({
      where: { status: "PAID", createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { totalCents: true, commissionCents: true, feeCents: true },
    });

  const [organizers, signups30d, active30d, publishedEvents, paying, customers, month, year, ticketsMonth] =
    await Promise.all([
      prisma.organizer.count(),
      prisma.organizer.count({ where: { createdAt: { gte: d30 } } }),
      sellingOrganizers(d30),
      prisma.event.count({ where: { status: "PUBLISHED" } }),
      prisma.organizer.count({ where: { events: { some: { status: "PUBLISHED" } } } }),
      prisma.user.count({ where: { role: "CUSTOMER" } }),
      paidSince(monthStart),
      paidSince(yearStart),
      prisma.ticket.count({ where: { order: { status: "PAID", createdAt: { gte: monthStart } } } }),
    ]);
  const kept = (a: typeof month) => (a._sum.commissionCents ?? 0) + (a._sum.feeCents ?? 0);

  return NextResponse.json({
    app: "ticketick",
    capturedAt: now.toISOString(),
    currency: "CHF",
    figures: {
      accounts: organizers,
      active30d,
      signups30d,
      paying,
      revenueMonthCents: kept(month),
      revenueYearCents: kept(year),
      gmvMonthCents: month._sum.totalCents ?? 0,
      gmvYearCents: year._sum.totalCents ?? 0,
      ordersMonth: month._count._all,
      ticketsMonth,
      publishedEvents,
      customers,
    },
    labels: {
      accounts: "Organisateurs",
      active30d: "Organisateurs qui vendent (30 j)",
      paying: "Organisateurs avec spectacle publié",
      revenueMonthCents: "Commissions et frais ce mois",
      revenueYearCents: "Commissions et frais cette année",
      gmvMonthCents: "Billets vendus ce mois",
      gmvYearCents: "Billets vendus cette année",
      ordersMonth: "Commandes ce mois",
      ticketsMonth: "Billets ce mois",
      publishedEvents: "Spectacles publiés",
      customers: "Comptes acheteurs",
    },
  });
}
