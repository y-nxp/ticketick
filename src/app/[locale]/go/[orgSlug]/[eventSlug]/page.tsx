import Image from "next/image";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OrganizerShell } from "@/components/branding/organizer-shell";
import { EventBooking } from "@/components/events/event-booking";
import { EventTags } from "@/components/events/event-tags";
import { Link } from "@/i18n/navigation";
import { getEventBySlug } from "@/lib/data/events";
import { eventAlternates, eventJsonLd, jsonLdScript } from "@/lib/seo/event";
import { eventTags, t } from "@/lib/types";
import { siteOpenGraph } from "@/lib/seo/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; orgSlug: string; eventSlug: string }>;
}): Promise<Metadata> {
  const { locale, orgSlug, eventSlug } = await params;
  const event = await getEventBySlug(eventSlug);
  if (!event || event.organizer.slug !== orgSlug) return {};
  return {
    title: `${t(event.title, locale)} · ${event.organizer.name}`,
    description: t(event.description, locale),
    alternates: event.visibility === "MEMBERS" ? undefined : eventAlternates(event, locale),
    openGraph: event.coverImage ? siteOpenGraph(locale, [event.coverImage]) : undefined,
  };
}

export default async function OrganizerEventPage({
  params,
}: {
  params: Promise<{ locale: string; orgSlug: string; eventSlug: string }>;
}) {
  const { locale, orgSlug, eventSlug } = await params;
  setRequestLocale(locale);

  const event = await getEventBySlug(eventSlug);
  if (!event || event.organizer.slug !== orgSlug) notFound();

  const tp = await getTranslations("portal");
  // Un spectacle publié sur l'accueil y porte ses données structurées.
  const jsonLd = event.visibility === "UNLISTED" ? eventJsonLd(event, locale) : [];

  return (
    <OrganizerShell organizer={event.organizer}>
      {jsonLd.length ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
        />
      ) : null}
      <Link
        href={`/go/${event.organizer.slug}`}
        className="group mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground shadow-sm transition-colors hover:border-[var(--brand-accent)] hover:text-[var(--brand-accent)]"
      >
        <ArrowLeft
          className="size-4 transition-transform group-hover:-translate-x-0.5"
          aria-hidden
        />
        {tp("backToList")}
      </Link>

      {event.coverImage ? (
        <div className="relative aspect-[21/9] w-full overflow-hidden rounded-3xl">
          <Image
            src={event.coverImage}
            alt={t(event.title, locale)}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </div>
      ) : null}

      <div className="mt-8">
        <EventBooking
          event={event}
          locale={locale}
          heading={
            <div>
              <EventTags tags={eventTags(event, locale)} large className="mb-3" />
              <h1 className="organizer-title">{t(event.title, locale)}</h1>
              <p className="mt-2 text-sm text-neutral-600">
                {event.organizer.name}
              </p>
            </div>
          }
        />
      </div>
    </OrganizerShell>
  );
}
