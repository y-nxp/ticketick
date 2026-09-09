import { PrismaClient } from "@prisma/client";
import { events, categories, organizers } from "../src/lib/mock-data";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seed ticketick…");

  // Catégories
  for (const c of categories) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, color: c.color, icon: c.icon },
      create: { slug: c.slug, name: c.name, color: c.color, icon: c.icon },
    });
  }

  // Organisateurs
  for (const o of organizers) {
    await prisma.organizer.upsert({
      where: { slug: o.slug },
      update: {
        name: o.name,
        friendsAppEnabled: o.friendsAppEnabled,
      },
      create: {
        slug: o.slug,
        name: o.name,
        email: `${o.slug}@ticketick.ch`,
        friendsAppEnabled: o.friendsAppEnabled,
      },
    });
  }

  // Événements
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

    const event = await prisma.event.upsert({
      where: { slug: e.slug },
      update: {},
      create: {
        slug: e.slug,
        title: e.title,
        description: e.description,
        status: e.status,
        featured: e.featured,
        coverImage: e.coverImage,
        gallery: e.gallery,
        startsAt: new Date(e.startsAt),
        endsAt: e.endsAt ? new Date(e.endsAt) : undefined,
        doorsAt: e.doorsAt ? new Date(e.doorsAt) : undefined,
        hasMap: e.hasMap,
        venueId: venue.id,
        organizerId: organizer.id,
        categories: {
          connect: dbCategories.map((c) => ({ id: c.id })),
        },
        ticketTypes: {
          create: e.ticketTypes.map((tt) => ({
            name: tt.name,
            priceCents: tt.priceCents,
            currency: tt.currency,
            quantity: tt.quantity,
            sold: tt.sold,
            maxPerOrder: tt.maxPerOrder,
          })),
        },
      },
    });

    if (e.hasMap && e.venue.lat && e.venue.lng) {
      await prisma.seatMap.upsert({
        where: { eventId: event.id },
        update: {},
        create: {
          eventId: event.id,
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
