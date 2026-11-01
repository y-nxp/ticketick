/**
 * Événements de test pour le plan de salle (#89), à lancer sur la copie de
 * test uniquement : `npx tsx prisma/setup-plan-test.ts`.
 *
 * Crée une salle fictive avec le dessin de Rougemont et trois séances :
 *  - « Plan multi-catégories » : quatre catégories, toutes en vente ;
 *  - « Plan multi-catégories » 2ᵉ séance : sans tarif Catégorie 2, donc des
 *    places « hors tarif » ;
 *  - « Plan à prix unique » : le même dessin, une seule couleur.
 * Quelques places sont déjà occupées ou bloquées pour voir tous les états.
 *
 * Rejouable : ne recrée rien de ce qui existe déjà. Ne touche pas à Rougemont.
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { rougemontLayout } from "../src/lib/seating/plans/rougemont";
import type { SeatLayout } from "../src/lib/seating/layout";

const prisma = new PrismaClient();

const ORG_SLUG = "essai-plan-de-salle";
const VENUE_NAME = "Salle d’essai (plan de salle)";
const DAY = 24 * 3600 * 1000;

const same = (text: string) => ({ fr: text, en: text, de: text, it: text });

const multiLayout: SeatLayout = rougemontLayout;

/** Même dessin, une seule catégorie : le cas du prix unique. */
const singleLayout: SeatLayout = {
  ...rougemontLayout,
  zones: [
    {
      key: "UNIQUE",
      color: "#CFC9F8",
      name: { fr: "Place", en: "Seat", de: "Platz", it: "Posto" },
    },
  ],
  seats: rougemontLayout.seats.map((s) => ({ ...s, zone: "UNIQUE" })),
};

async function ensurePlan(slug: string, name: string, venueId: string, layout: SeatLayout) {
  return prisma.seatPlan.upsert({
    where: { slug },
    create: { slug, name, venueId, layout: layout as unknown as Prisma.InputJsonValue },
    update: { layout: layout as unknown as Prisma.InputJsonValue },
    select: { id: true },
  });
}

interface Tariff {
  name: string;
  priceCents: number;
  zones: string[];
}

async function ensureEvent(opts: {
  slug: string;
  title: string;
  organizerId: string;
  venueId: string;
  planId: string;
  layout: SeatLayout;
  sessions: { label?: string; inDays: number; tariffs: Tariff[] }[];
}) {
  if (await prisma.event.findUnique({ where: { slug: opts.slug }, select: { id: true } })) {
    console.log(`  = ${opts.slug} existe déjà`);
    return;
  }
  const zoneCount = (zones: string[]) =>
    opts.layout.seats.filter((s) => zones.includes(s.zone)).length;

  await prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        slug: opts.slug,
        title: same(opts.title),
        description: same("Séance d’essai pour vérifier la lisibilité du plan de salle."),
        status: "PUBLISHED",
        visibility: "PUBLIC",
        acceptCard: false,
        acceptIban: true,
        organizerId: opts.organizerId,
      },
      select: { id: true },
    });
    for (const [i, s] of opts.sessions.entries()) {
      const session = await tx.eventSession.create({
        data: {
          eventId: event.id,
          label: s.label ? same(s.label) : undefined,
          startsAt: new Date(Date.now() + s.inDays * DAY),
          status: "PUBLISHED",
          venueId: opts.venueId,
          seatPlanId: opts.planId,
          capacity: opts.layout.seats.length,
        },
        select: { id: true },
      });
      for (const t of s.tariffs) {
        await tx.ticketType.create({
          data: {
            sessionId: session.id,
            name: same(t.name),
            priceCents: t.priceCents,
            currency: "CHF",
            quantity: zoneCount(t.zones),
            maxPerOrder: 10,
            seatZones: t.zones,
          },
        });
      }
      // Quelques places prises ou bloquées, réparties sur toutes les zones.
      await tx.sessionSeat.createMany({
        data: opts.layout.seats.map((seat, n) => ({
          sessionId: session.id,
          seatKey: seat.key,
          zone: seat.zone,
          status: n % 7 === 3 ? "RESERVED" : n % 23 === 5 ? "BLOCKED" : "AVAILABLE",
          blockNote: n % 23 === 5 && n % 7 !== 3 ? "Invité artiste" : null,
        })),
        skipDuplicates: true,
      });
      console.log(`  + ${opts.slug}, séance ${i + 1}`);
    }
  });
}

async function main() {
  const organizer = await prisma.organizer.upsert({
    where: { slug: ORG_SLUG },
    create: { slug: ORG_SLUG, name: "Essai plan de salle", email: `${ORG_SLUG}@ticketick.ch` },
    update: {},
    select: { id: true },
  });
  const venue =
    (await prisma.venue.findFirst({ where: { name: VENUE_NAME }, select: { id: true } })) ??
    (await prisma.venue.create({
      data: { name: VENUE_NAME, city: "Gstaad", canton: "BE", country: "CH" },
      select: { id: true },
    }));

  const multi = await ensurePlan("essai-multi-categories", "Essai — quatre catégories", venue.id, multiLayout);
  const single = await ensurePlan("essai-prix-unique", "Essai — prix unique", venue.id, singleLayout);

  const cat = (zone: string, name: string, chf: number): Tariff => ({
    name,
    priceCents: chf * 100,
    zones: [zone],
  });
  const all = [
    cat("PREMIUM", "Premium", 250),
    cat("CAT1", "Catégorie 1", 200),
    cat("CAT2", "Catégorie 2", 90),
    cat("CAT3", "Catégorie 3", 50),
  ];

  await ensureEvent({
    slug: "essai-plan-quatre-categories",
    title: "[Essai] Plan à quatre catégories (comme Rougemont)",
    organizerId: organizer.id,
    venueId: venue.id,
    planId: multi.id,
    layout: multiLayout,
    sessions: [
      { label: "Toutes catégories", inDays: 30, tariffs: all },
      { label: "Sans catégorie 2 (hors tarif)", inDays: 31, tariffs: all.filter((t) => t.zones[0] !== "CAT2") },
    ],
  });
  await ensureEvent({
    slug: "essai-plan-prix-unique",
    title: "[Essai] Plan à prix unique",
    organizerId: organizer.id,
    venueId: venue.id,
    planId: single.id,
    layout: singleLayout,
    sessions: [{ inDays: 32, tariffs: [{ name: "Place", priceCents: 4500, zones: ["UNIQUE"] }] }],
  });
  console.log("✅ Événements d’essai prêts : /fr/events/essai-plan-quatre-categories et /fr/events/essai-plan-prix-unique");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
