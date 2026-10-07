import type { MetadataRoute } from "next";
import { routing, type Locale } from "@/i18n/routing";
import { publicAppOrigin } from "@/lib/app-url";
import { prisma } from "@/lib/prisma";

// Les spectacles en vente changent en continu, et la base n'est pas
// joignable au build.
export const dynamic = "force-dynamic";

const pages = [
  "",
  "/about",
  "/how-it-works",
  "/organizer",
  "/friends",
  "/help",
  "/contact",
  "/terms",
  "/privacy",
];

/** L'espagnol ne traduit que le parcours d'achat. */
const shopLocales = routing.locales;
const siteLocales = routing.locales.filter((l) => l !== "es");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = publicAppOrigin();

  const url = (path: string, locale: Locale) =>
    locale === routing.defaultLocale
      ? `${origin}${path || "/"}`
      : `${origin}/${locale}${path}`;

  const entry = (
    path: string,
    locales: readonly Locale[],
    lastModified?: Date,
  ): MetadataRoute.Sitemap[number] => ({
    url: url(path, routing.defaultLocale),
    lastModified,
    alternates: {
      languages: Object.fromEntries([
        ...locales.map((l) => [l, url(path, l)]),
        ["x-default", url(path, routing.defaultLocale)],
      ]),
    },
  });

  const events = await prisma.event.findMany({
    where: {
      status: { in: ["PUBLISHED", "SOLD_OUT"] },
      visibility: { in: ["PUBLIC", "UNLISTED"] },
      sessions: {
        some: { startsAt: { gte: new Date() }, status: { not: "CANCELLED" } },
      },
    },
    select: {
      slug: true,
      visibility: true,
      updatedAt: true,
      organizer: { select: { slug: true, updatedAt: true } },
    },
  });

  // Une page par spectacle : celle de l'accueil de ticketick s'il y est
  // publié, sinon celle de l'organisateur.
  const eventEntries = events.map((e) =>
    entry(
      e.visibility === "PUBLIC"
        ? `/events/${e.slug}`
        : `/go/${e.organizer.slug}/${e.slug}`,
      shopLocales,
      e.updatedAt,
    ),
  );

  const organizers = new Map<string, Date>();
  for (const e of events) organizers.set(e.organizer.slug, e.organizer.updatedAt);
  const organizerEntries = [...organizers].map(([slug, updatedAt]) =>
    entry(`/go/${slug}`, shopLocales, updatedAt),
  );

  return [
    ...pages.map((p) => entry(p, siteLocales)),
    ...organizerEntries,
    ...eventEntries,
  ];
}
