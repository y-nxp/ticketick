/**
 * Gstaad New Year Music Festival, 21e édition (26.12.2026 – 10.01.2027).
 *
 * Crée l'organisateur, son compte, les trois lieux, le plan numéroté de
 * Rougemont, les 23 concerts et le rabais multi-concerts.
 *
 * Idempotent et lancé à chaque déploiement : le catalogue n'est créé qu'une
 * fois, avec l'organisateur. Ensuite seuls le plan de Rougemont et les sièges
 * des séances sont tenus à jour ; les réglages faits dans l'admin (prix,
 * textes, publication, concerts supprimés) ne sont jamais écrasés.
 */

import { Prisma, PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  ROUGEMONT_PLAN_SLUG,
  rougemontLayout,
} from "../src/lib/seating/plans/rougemont";

const prisma = new PrismaClient();

const ORG_SLUG = "gstaad-new-year-music-festival";
const ORG_NAME = "Gstaad New Year Music Festival";
const ACCOUNT_EMAIL = "gstaadnymf@ticketick.ch";
const COVER = "/covers/gstaad-nymf-2026.png";

type Tr = { fr: string; en: string; de: string; it: string };
const same = (s: string): Tr => ({ fr: s, en: s, de: s, it: s });

type VenueKey = "ROUGEMONT" | "STJOSEPH" | "LANDHAUS";

const VENUES: Record<
  VenueKey,
  { name: string; city: string; zip: string; canton: string; capacity: number }
> = {
  ROUGEMONT: { name: "Église de Rougemont", city: "Rougemont", zip: "1659", canton: "VD", capacity: 276 },
  STJOSEPH: { name: "Kirche St. Joseph", city: "Gstaad", zip: "3780", canton: "BE", capacity: 200 },
  LANDHAUS: { name: "Hôtel Landhaus", city: "Saanen", zip: "3792", canton: "BE", capacity: 300 },
};

const SERIES = {
  young: { fr: "Jeunes talents", en: "Young talents", de: "Junge Talente", it: "Giovani talenti" },
  masters: { fr: "Maîtres", en: "Masters", de: "Meister", it: "Maestri" },
  broadway: same("Broadway Musicals"),
} satisfies Record<string, Tr>;

type Pricing =
  | { kind: "categories"; premium: number; cat1: number; cat2: number; cat3: number }
  | { kind: "single"; price: number }
  | { kind: "free" };

interface Concert {
  date: string;
  time: string;
  artist: string;
  venue: VenueKey;
  pricing: Pricing;
  series?: keyof typeof SERIES;
}

const cat = (premium: number, cat1: number, cat2: number, cat3: number): Pricing => ({
  kind: "categories",
  premium,
  cat1,
  cat2,
  cat3,
});
const single = (price: number): Pricing => ({ kind: "single", price });

const CONCERTS: Concert[] = [
  { date: "2026-12-26", time: "19:00", artist: "Grigoryan / Antonyan", venue: "ROUGEMONT", pricing: cat(200, 130, 90, 50) },
  { date: "2026-12-27", time: "15:00", artist: "Ensemble Mare Nostrum", venue: "LANDHAUS", pricing: single(50) },
  { date: "2026-12-27", time: "19:00", artist: "Fuchs / Cemin", venue: "ROUGEMONT", pricing: cat(250, 200, 90, 50) },
  { date: "2026-12-28", time: "15:00", artist: "Berry / Pérot / Goimard", venue: "ROUGEMONT", pricing: single(30), series: "young" },
  { date: "2026-12-28", time: "19:00", artist: "Edris / Pati / Pordoy", venue: "ROUGEMONT", pricing: cat(250, 200, 90, 50) },
  { date: "2026-12-29", time: "15:00", artist: "Angioloni / Masson", venue: "LANDHAUS", pricing: single(50) },
  { date: "2026-12-29", time: "19:00", artist: "Grigolo", venue: "ROUGEMONT", pricing: cat(250, 200, 90, 50) },
  { date: "2026-12-30", time: "19:00", artist: "Spyres / Pordoy", venue: "ROUGEMONT", pricing: cat(250, 200, 90, 50) },
  { date: "2027-01-01", time: "18:30", artist: "Sirolli / Pikulski", venue: "ROUGEMONT", pricing: { kind: "free" }, series: "broadway" },
  { date: "2027-01-02", time: "19:00", artist: "Oropesa / Tézier / Praticò", venue: "ROUGEMONT", pricing: cat(250, 200, 90, 50) },
  { date: "2027-01-03", time: "15:00", artist: "Bernheim / Matheson", venue: "ROUGEMONT", pricing: cat(250, 200, 90, 50) },
  { date: "2027-01-03", time: "19:00", artist: "Mkhitaryan / Zhilikhovsky", venue: "ROUGEMONT", pricing: cat(180, 130, 90, 50) },
  { date: "2027-01-04", time: "15:00", artist: "Ryan-Dugelay", venue: "STJOSEPH", pricing: single(30) },
  { date: "2027-01-04", time: "18:30", artist: "Pagano", venue: "STJOSEPH", pricing: single(30) },
  { date: "2027-01-05", time: "15:00", artist: "Arderíus", venue: "STJOSEPH", pricing: single(30) },
  { date: "2027-01-05", time: "19:00", artist: "Amadi / Belkin", venue: "ROUGEMONT", pricing: single(50), series: "masters" },
  { date: "2027-01-06", time: "15:00", artist: "Chenaux", venue: "STJOSEPH", pricing: single(30) },
  { date: "2027-01-06", time: "19:00", artist: "Schmitt / Reyes", venue: "ROUGEMONT", pricing: cat(180, 130, 90, 50) },
  { date: "2027-01-07", time: "19:00", artist: "Earl Rose", venue: "STJOSEPH", pricing: single(50) },
  { date: "2027-01-08", time: "15:00", artist: "Trio Nebelmeer", venue: "ROUGEMONT", pricing: single(30), series: "young" },
  { date: "2027-01-08", time: "19:00", artist: "Jany McPherson Trio", venue: "ROUGEMONT", pricing: single(50) },
  { date: "2027-01-09", time: "15:00", artist: "Martina Meola", venue: "ROUGEMONT", pricing: single(30), series: "young" },
  { date: "2027-01-10", time: "15:00", artist: "Alexandros Kapelis", venue: "ROUGEMONT", pricing: single(50), series: "masters" },
];

const YOUTH_NAME: Tr = {
  fr: "Gratuité moins de 25 ans",
  en: "Free – under 25",
  de: "Gratis – unter 25",
  it: "Gratuito – under 25",
};
const ZONE_NAMES: Record<string, Tr> = {
  PREMIUM: same("Premium"),
  CAT1: { fr: "Catégorie 1", en: "Category 1", de: "Kategorie 1", it: "Categoria 1" },
  CAT2: { fr: "Catégorie 2", en: "Category 2", de: "Kategorie 2", it: "Categoria 2" },
  CAT3: { fr: "Catégorie 3", en: "Category 3", de: "Kategorie 3", it: "Categoria 3" },
};
const NUMBERED: Tr = { fr: "Place numérotée", en: "Numbered seat", de: "Nummerierter Platz", it: "Posto numerato" };
const UNRESERVED: Tr = { fr: "Placement libre", en: "Unreserved seating", de: "Freie Platzwahl", it: "Posto libero" };
const FREE_BOOKING: Tr = {
  fr: "Réservation gratuite",
  en: "Free reservation",
  de: "Kostenlose Reservierung",
  it: "Prenotazione gratuita",
};

function description(venue: VenueKey): Tr {
  const v = VENUES[venue];
  const where = `${v.name}, ${v.city}`;
  return {
    fr: `Gstaad New Year Music Festival, 21e édition. ${where}. Programme détaillé sur gstaadnewyearmusicfestival.ch.`,
    en: `Gstaad New Year Music Festival, 21st edition. ${where}. Full programme on gstaadnewyearmusicfestival.ch.`,
    de: `Gstaad New Year Music Festival, 21. Ausgabe. ${where}. Detailliertes Programm auf gstaadnewyearmusicfestival.ch.`,
    it: `Gstaad New Year Music Festival, 21a edizione. ${where}. Programma dettagliato su gstaadnewyearmusicfestival.ch.`,
  };
}

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Heure d'hiver à Gstaad : UTC+1 sur toute la durée du festival. */
function zurich(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+01:00`);
}

interface TariffInput {
  name: Tr;
  priceCents: number;
  quantity: number;
  maxPerOrder: number;
  seatZones?: string[];
  youth?: boolean;
}

function tariffsFor(concert: Concert): TariffInput[] {
  const capacity = VENUES[concert.venue].capacity;
  const p = concert.pricing;
  if (p.kind === "free") {
    return [{ name: FREE_BOOKING, priceCents: 0, quantity: capacity, maxPerOrder: 6 }];
  }
  if (p.kind === "categories") {
    const counts = { PREMIUM: 0, CAT1: 0, CAT2: 0, CAT3: 0 } as Record<string, number>;
    for (const seat of rougemontLayout.seats) counts[seat.zone] += 1;
    const prices: Record<string, number> = {
      PREMIUM: p.premium,
      CAT1: p.cat1,
      CAT2: p.cat2,
      CAT3: p.cat3,
    };
    return [
      ...Object.keys(prices).map((zone) => ({
        name: ZONE_NAMES[zone],
        priceCents: prices[zone] * 100,
        quantity: counts[zone],
        maxPerOrder: 10,
        seatZones: [zone],
      })),
      {
        name: YOUTH_NAME,
        priceCents: 0,
        quantity: counts.CAT2 + counts.CAT3,
        maxPerOrder: 2,
        seatZones: ["CAT2", "CAT3"],
        youth: true,
      },
    ];
  }
  return [
    {
      name: concert.venue === "ROUGEMONT" ? NUMBERED : UNRESERVED,
      priceCents: p.price * 100,
      quantity: capacity,
      maxPerOrder: 10,
    },
    { name: YOUTH_NAME, priceCents: 0, quantity: capacity, maxPerOrder: 2, youth: true },
  ];
}

async function ensureAccount(organizerId: string) {
  const existing = await prisma.user.findUnique({
    where: { email: ACCOUNT_EMAIL },
    select: { id: true, role: true },
  });
  if (existing && existing.role !== "ORGANIZER" && existing.role !== "CUSTOMER") {
    console.log(`  ⚠ ${ACCOUNT_EMAIL} a le rôle ${existing.role} : compte laissé tel quel.`);
    return;
  }
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { role: "ORGANIZER", active: true },
        select: { id: true },
      })
    : await prisma.user.create({
        data: {
          email: ACCOUNT_EMAIL,
          name: ORG_NAME,
          role: "ORGANIZER",
          locale: "fr",
          emailVerifiedAt: new Date(),
          // Inconnu de tous : le premier accès passe par « mot de passe oublié ».
          passwordHash: await bcrypt.hash(randomBytes(24).toString("base64url"), 12),
        },
        select: { id: true },
      });
  const owner = await prisma.organizer.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (owner && owner.id !== organizerId) {
    console.log(`  ⚠ ${ACCOUNT_EMAIL} est déjà lié à un autre organisateur.`);
    return;
  }
  await prisma.organizer.update({ where: { id: organizerId }, data: { userId: user.id } });
  if (!existing) console.log(`  Compte ${ACCOUNT_EMAIL} créé : premier accès par « mot de passe oublié ».`);
}

async function findOrCreateVenue(tx: Prisma.TransactionClient, key: VenueKey) {
  const v = VENUES[key];
  const found = await tx.venue.findFirst({
    where: { name: v.name, city: v.city },
    select: { id: true },
  });
  if (found) return found.id;
  const created = await tx.venue.create({
    data: { name: v.name, city: v.city, zip: v.zip, canton: v.canton, country: "CH" },
    select: { id: true },
  });
  return created.id;
}

async function createCatalog() {
  return prisma.$transaction(
    async (tx) => {
      const organizer = await tx.organizer.create({
        data: {
          slug: ORG_SLUG,
          name: ORG_NAME,
          email: ACCOUNT_EMAIL,
          website: "https://gstaadnewyearmusicfestival.ch",
        },
        select: { id: true },
      });

      const venueIds = {
        ROUGEMONT: await findOrCreateVenue(tx, "ROUGEMONT"),
        STJOSEPH: await findOrCreateVenue(tx, "STJOSEPH"),
        LANDHAUS: await findOrCreateVenue(tx, "LANDHAUS"),
      };

      const plan = await tx.seatPlan.upsert({
        where: { slug: ROUGEMONT_PLAN_SLUG },
        create: {
          slug: ROUGEMONT_PLAN_SLUG,
          name: "Église de Rougemont — concert",
          venueId: venueIds.ROUGEMONT,
          layout: rougemontLayout as unknown as Prisma.InputJsonValue,
        },
        update: {},
        select: { id: true },
      });

      for (const concert of CONCERTS) {
        const seated = concert.venue === "ROUGEMONT";
        const event = await tx.event.create({
          data: {
            slug: `gnymf-${concert.date}-${slugify(concert.artist)}`,
            title: same(concert.artist),
            description: description(concert.venue),
            status: "DRAFT",
            visibility: "PUBLIC",
            coverImage: COVER,
            acceptCard: false,
            acceptIban: false,
            acceptPaypal: true,
            organizerId: organizer.id,
            sessions: {
              create: {
                startsAt: zurich(concert.date, concert.time),
                status: "PUBLISHED",
                venueId: venueIds[concert.venue],
                seatPlanId: seated ? plan.id : null,
                capacity: VENUES[concert.venue].capacity,
                label: concert.series ? SERIES[concert.series] : undefined,
              },
            },
          },
          select: { sessions: { select: { id: true } } },
        });
        const sessionId = event.sessions[0].id;
        for (const t of tariffsFor(concert)) {
          await tx.ticketType.create({
            data: {
              sessionId,
              name: t.name,
              priceCents: t.priceCents,
              currency: "CHF",
              quantity: t.quantity,
              maxPerOrder: t.maxPerOrder,
              seatZones: t.seatZones ?? [],
              ...(t.youth
                ? { maxPerPaidTicket: 2, requiresAttendee: true, maxAgeYears: 25 }
                : {}),
            },
          });
        }
      }

      await tx.discount.create({
        data: {
          label: {
            fr: "Rabais multi-concerts −15 %",
            en: "Multi-concert discount −15%",
            de: "Mehrkonzert-Rabatt −15 %",
            it: "Sconto multi-concerto −15%",
          },
          type: "PERCENTAGE",
          value: 1500,
          scope: "ORDER",
          organizerId: organizer.id,
          venueId: venueIds.ROUGEMONT,
          minDistinctSessions: 3,
        },
      });

      return organizer.id;
    },
    { timeout: 60_000 },
  );
}

async function syncRougemont() {
  const found = await prisma.seatPlan.findUnique({
    where: { slug: ROUGEMONT_PLAN_SLUG },
    select: { id: true },
  });
  if (!found) return { sessions: 0, created: 0 };
  const plan = await prisma.seatPlan.update({
    where: { id: found.id },
    data: { layout: rougemontLayout as unknown as Prisma.InputJsonValue },
    select: { id: true, sessions: { select: { id: true } } },
  });
  let created = 0;
  for (const session of plan.sessions) {
    const { count } = await prisma.sessionSeat.createMany({
      data: rougemontLayout.seats.map((s) => ({
        sessionId: session.id,
        seatKey: s.key,
        zone: s.zone,
      })),
      skipDuplicates: true,
    });
    created += count;
  }
  return { sessions: plan.sessions.length, created };
}

async function main() {
  const existing = await prisma.organizer.findUnique({
    where: { slug: ORG_SLUG },
    select: { id: true },
  });
  let organizerId = existing?.id;
  if (!organizerId) {
    organizerId = await createCatalog();
    console.log(`  Catalogue créé : ${CONCERTS.length} concerts (brouillons).`);
  }
  await ensureAccount(organizerId);
  const seats = await syncRougemont();
  console.log(
    `✅ ${ORG_NAME} : plan Rougemont à jour, ${seats.sessions} séances numérotées, ${seats.created} sièges ajoutés.`,
  );
}

main()
  .catch((error) => {
    console.error(`✖ ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
