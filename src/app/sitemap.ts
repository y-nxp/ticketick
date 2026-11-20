import type { MetadataRoute } from "next";
import { routing, type Locale } from "@/i18n/routing";
import { publicAppOrigin } from "@/lib/app-url";
import { articlePath, blogIndexPath, localesWithArticles } from "@/lib/blog/articles";
import { getArticles } from "@/lib/blog/source";
import { prisma } from "@/lib/prisma";
import { localizedPath } from "@/lib/seo/event";

// Les spectacles en vente changent en continu, et la base n'est pas
// joignable au build.
export const dynamic = "force-dynamic";

const pages = [
  "",
  "/about",
  "/how-it-works",
  "/organizer",
  "/pricing",
  "/friends",
  "/help",
  "/contact",
  "/developers",
  "/terms",
  "/privacy",
];

/** L'espagnol ne traduit que le parcours d'achat. */
const shopLocales = routing.locales;
const siteLocales = routing.locales.filter((l) => l !== "es");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = publicAppOrigin();

  const url = (path: string, locale: Locale) => `${origin}${localizedPath(path, locale)}`;

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

  // Blog : une liste par langue qui a des articles, et chaque article dans
  // sa seule langue. API muette : le sitemap sort sans le blog.
  const articles = (await getArticles()) ?? [];
  const blogLocales = localesWithArticles(articles);
  const blogEntries: MetadataRoute.Sitemap = [
    ...(blogLocales.length > 0
      ? [
          {
            url: `${origin}${blogIndexPath(blogLocales.includes("fr") ? "fr" : blogLocales[0])}`,
            lastModified: articles[0]?.modifiedAt ? new Date(articles[0].modifiedAt) : undefined,
            alternates: {
              languages: Object.fromEntries(blogLocales.map((l) => [l, `${origin}${blogIndexPath(l)}`])),
            },
          },
        ]
      : []),
    ...articles.map((a) => ({
      url: `${origin}${articlePath(a)}`,
      lastModified: a.modifiedAt ? new Date(a.modifiedAt) : undefined,
      alternates: { languages: { [a.locale]: `${origin}${articlePath(a)}` } },
    })),
  ];

  return [
    ...pages.map((p) => entry(p, siteLocales)),
    ...blogEntries,
    ...organizerEntries,
    ...eventEntries,
  ];
}
