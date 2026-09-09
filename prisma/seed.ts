import { PrismaClient } from "@prisma/client";
import { events, categories, organizers } from "./fixtures";

const prisma = new PrismaClient();

/** Décale une date de n jours, pour générer des séances supplémentaires. */
function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Les dates des fixtures sont écrites en dur et vieillissent. On translate
 * tout le catalogue pour que la plus ancienne séance tombe une semaine après
 * le seed, en conservant l'espacement relatif des événements : la démo reste
 * ainsi crédible quelle que soit la date d'exécution.
 */
const DATE_SHIFT_MS = (() => {
  const DAY = 24 * 3600 * 1000;
  const earliest = Math.min(...events.map((e) => +new Date(e.startsAt)));
  const diff = Date.now() + 7 * DAY - earliest;
  // Arrondi au jour entier : sans cela toutes les séances hériteraient de
  // l'heure d'exécution du seed au lieu de leur horaire de spectacle.
  return diff > 0 ? Math.ceil(diff / DAY) * DAY : 0;
})();

function shift(value: string | Date) {
  return new Date(+new Date(value) + DATE_SHIFT_MS);
}

async function main() {
  console.log("🌱 Seed ticketick…");

  // ── Catégories
  for (const c of categories) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, color: c.color, icon: c.icon },
      create: { slug: c.slug, name: c.name, color: c.color, icon: c.icon },
    });
  }

  // ── Organisateurs
  for (const o of organizers) {
    await prisma.organizer.upsert({
      where: { slug: o.slug },
      update: { name: o.name, friendsAppEnabled: o.friendsAppEnabled },
      create: {
        slug: o.slug,
        name: o.name,
        email: `${o.slug}@ticketick.ch`,
        friendsAppEnabled: o.friendsAppEnabled,
      },
    });
  }

  // ── Événements et leurs séances
  for (const e of events) {
    const organizer = await prisma.organizer.findUnique({
      where: { slug: e.organizer.slug },
    });
    if (!organizer) continue;

    const venue = await prisma.venue.upsert({
      where: { id: e.venue.id },
      update: {},
      create: {
        id: e.venue.id,
        name: e.venue.name,
        address: e.venue.address,
        city: e.venue.city,
        canton: e.venue.canton,
        country: e.venue.country,
        lat: e.venue.lat,
        lng: e.venue.lng,
      },
    });

    const dbCategories = await prisma.category.findMany({
      where: { slug: { in: e.categories.map((c) => c.slug) } },
    });

    // Le seed est convergent : relancé, il réaligne les lignes existantes sur
    // les fixtures plutôt que de laisser des données périmées.
    const event = await prisma.event.upsert({
      where: { slug: e.slug },
      update: {
        title: e.title,
        description: e.description,
        status: e.status,
        featured: e.featured,
        coverImage: e.coverImage,
        categories: { set: dbCategories.map((c) => ({ id: c.id })) },
      },
      create: {
        slug: e.slug,
        title: e.title,
        description: e.description,
        status: e.status,
        featured: e.featured,
        coverImage: e.coverImage,
        gallery: e.gallery,
        organizerId: organizer.id,
        categories: { connect: dbCategories.map((c) => ({ id: c.id })) },
      },
    });

    // Les données mock sont à date unique : une seule séance, sauf pour le
    // théâtre où l'on en génère trois afin d'exercer la relation 1-N.
    const isSerie = e.categories.some((c) => c.slug === "theatre");
    const offsets = isSerie ? [0, 1, 2] : [0];

    for (const [i, offset] of offsets.entries()) {
      const sessionId = `${e.slug}-s${i + 1}`;
      const startsAt = addDays(shift(e.startsAt), offset);

      const session = await prisma.eventSession.upsert({
        where: { id: sessionId },
        update: { startsAt, status: e.status, venueId: venue.id },
        create: {
          id: sessionId,
          eventId: event.id,
          label: isSerie
            ? { fr: `Représentation ${i + 1}`, en: `Performance ${i + 1}`, de: `Vorstellung ${i + 1}`, it: `Rappresentazione ${i + 1}` }
            : undefined,
          startsAt,
          endsAt: e.endsAt ? addDays(shift(e.endsAt), offset) : undefined,
          doorsAt: e.doorsAt ? addDays(shift(e.doorsAt), offset) : undefined,
          status: e.status,
          venueId: venue.id,
          ticketTypes: {
            create: e.ticketTypes.map((tt) => ({
              name: tt.name,
              priceCents: tt.priceCents,
              currency: tt.currency,
              quantity: tt.quantity,
              sold: i === 0 ? tt.sold : 0,
              maxPerOrder: tt.maxPerOrder,
            })),
          },
        },
      });

      // Plan de salle seulement si l'événement en déclare un.
      if (e.hasMap) {
        await prisma.seatMap.upsert({
          where: { sessionId: session.id },
          update: {},
          create: {
            sessionId: session.id,
            layout: {
              type: "sections",
              sections: [
                { id: "orchestra", name: "Orchestre", rows: 20, seatsPerRow: 30 },
                { id: "balcony", name: "Balcon", rows: 10, seatsPerRow: 24 },
              ],
            },
          },
        });
      }
    }
  }

  // ── Points de vente partenaires
  const resellers = [
    {
      slug: "ot-montreux",
      name: "Office du Tourisme de Montreux",
      email: "billetterie@montreux-tourisme.ch",
      city: "Montreux",
      commissionBps: 800, // 8 %
    },
    {
      slug: "ot-gstaad",
      name: "Office du Tourisme de Gstaad",
      email: "tickets@gstaad-tourisme.ch",
      city: "Gstaad",
      commissionBps: 600, // 6 %
    },
  ];

  for (const r of resellers) {
    await prisma.reseller.upsert({
      where: { slug: r.slug },
      update: { name: r.name, commissionBps: r.commissionBps },
      create: { ...r, type: "TOURISM_OFFICE", allowCashSales: true },
    });
  }

  // ── Rabais de démonstration
  await prisma.discount.upsert({
    where: { code: "BIENVENUE10" },
    update: {},
    create: {
      code: "BIENVENUE10",
      label: { fr: "Bienvenue -10 %", en: "Welcome -10%", de: "Willkommen -10 %", it: "Benvenuto -10%" },
      type: "PERCENTAGE",
      value: 1000, // 10 % en points de base
      scope: "ORDER",
      minAmountCents: 2000,
      maxRedemptions: 500,
    },
  });

  const featured = await prisma.event.findFirst({ where: { featured: true } });
  if (featured) {
    const earlyBirdId = `early-bird-${featured.slug}`;
    await prisma.discount.upsert({
      where: { id: earlyBirdId },
      update: {},
      create: {
        id: earlyBirdId,
        // Pas de code : rabais automatique dès 4 billets achetés.
        label: { fr: "Tarif groupe", en: "Group rate", de: "Gruppentarif", it: "Tariffa gruppo" },
        type: "FIXED_AMOUNT",
        value: 500, // 5.00 CHF
        scope: "EVENT",
        eventId: featured.id,
        minQuantity: 4,
      },
    });
  }

  console.log("✅ Seed terminé.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
