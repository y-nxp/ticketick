import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ExternalLink } from "lucide-react";
import { OrganizerShell } from "@/components/branding/organizer-shell";
import { SharePageButton } from "@/components/branding/share-page-button";
import { EventCard } from "@/components/events/event-card";
import {
  getOrganizerBySlug,
  getOrganizerEvents,
} from "@/lib/data/events";
import { t } from "@/lib/types";
import { routing } from "@/i18n/routing";
import { pageAlternates, siteOpenGraph } from "@/lib/seo/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; orgSlug: string }>;
}): Promise<Metadata> {
  const { locale, orgSlug } = await params;
  const organizer = await getOrganizerBySlug(orgSlug);
  if (!organizer) return {};
  return {
    title: organizer.name,
    description: organizer.description
      ? t(organizer.description, locale)
      : organizer.website,
    openGraph: organizer.logoUrl ? siteOpenGraph(locale, [organizer.logoUrl]) : undefined,
    alternates: pageAlternates(`/go/${organizer.slug}`, locale, routing.locales),
  };
}

/**
 * Page de billetterie de l'organisateur, à ses couleurs : tous ses
 * spectacles en vente, publiés ou non sur l'accueil de ticketick.
 */
export default async function OrganizerPortalPage({
  params,
}: {
  params: Promise<{ locale: string; orgSlug: string }>;
}) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);

  const organizer = await getOrganizerBySlug(orgSlug);
  if (!organizer) notFound();

  const events = await getOrganizerEvents(organizer.id);
  const tp = await getTranslations("portal");
  const te = await getTranslations("event");

  return (
    <OrganizerShell organizer={organizer}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="organizer-kicker">{tp("tickets")}</p>
          <h1 className="organizer-title">{organizer.name}</h1>
          {organizer.description ? (
            <p className="mt-3 max-w-2xl whitespace-pre-line text-sm text-muted-foreground">
              {t(organizer.description, locale)}
            </p>
          ) : null}
          {organizer.website ? (
            <a
              href={organizer.website}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-[var(--brand-accent)] hover:underline"
            >
              <ExternalLink className="size-4" />
              {tp("visitSite")}
            </a>
          ) : null}
        </div>
        <SharePageButton title={organizer.name} />
      </div>

      <section className="mt-10">
        <h2 className="organizer-title text-2xl">{tp("upcoming")}</h2>
        {events.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{tp("noEvents")}</p>
        ) : (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                locale={locale}
                href={`/go/${organizer.slug}/${event.slug}`}
                labels={{
                  from: tp("from"),
                  soldOut: te("soldOut"),
                  dates: (n) => tp("dateCount", { count: n }),
                  onRegistration: te("contact.badge"),
                }}
              />
            ))}
          </div>
        )}
      </section>
    </OrganizerShell>
  );
}
