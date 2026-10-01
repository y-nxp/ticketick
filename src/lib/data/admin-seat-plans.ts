import "server-only";

import { requireAdmin } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { readLayout } from "@/lib/seating/layout";

/**
 * Lectures de l'écran « Plans de salle ». Un plan est partagé par tous les
 * organisateurs qui jouent dans la salle : seul l'administrateur y touche.
 */

export async function getSeatPlans() {
  await requireAdmin();
  const plans = await prisma.seatPlan.findMany({
    orderBy: [{ venue: { name: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      layout: true,
      createdAt: true,
      venue: { select: { name: true, city: true } },
      _count: { select: { sessions: true } },
    },
  });
  return plans.map(({ layout, ...plan }) => {
    const parsed = readLayout(layout);
    return {
      ...plan,
      seatCount: parsed?.seats.length ?? 0,
      zones: parsed?.zones.map((z) => ({ key: z.key, name: z.name, color: z.color })) ?? [],
    };
  });
}

export async function getSeatPlan(id: string) {
  await requireAdmin();
  const plan = await prisma.seatPlan.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      layout: true,
      venue: { select: { name: true, city: true } },
      _count: { select: { sessions: true } },
    },
  });
  const layout = readLayout(plan?.layout);
  if (!plan || !layout) return null;
  // Sièges vendus ou retenus sur au moins une séance : leur référence est
  // imprimée sur des billets, l'éditeur les verrouille.
  const taken = await prisma.sessionSeat.findMany({
    where: { session: { seatPlanId: id }, status: "RESERVED" },
    select: { seatKey: true },
    distinct: ["seatKey"],
  });
  return { ...plan, layout, lockedKeys: taken.map((s) => s.seatKey) };
}

export async function getPlanVenues() {
  await requireAdmin();
  return prisma.venue.findMany({
    orderBy: [{ city: "asc" }, { name: "asc" }],
    select: { id: true, name: true, city: true },
  });
}
