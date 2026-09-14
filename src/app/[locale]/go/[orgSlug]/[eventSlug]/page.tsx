import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OrganizerShell } from "@/components/branding/organizer-shell";
import { EventBooking } from "@/components/events/event-booking";
import { Link } from "@/i18n/navigation";
import { getEventBySlug } from "@/lib/data/events";
import { t } from "@/lib/types";

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
    openGraph: event.coverImage ? { images: [event.coverImage] } : undefined,
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

  return (
    <OrganizerShell organizer={event.organizer}>
      <Link
        href={`/go/${event.organizer.slug}`}
        className="mb-6 inline-block text-sm text-neutral-600 hover:text-[var(--brand-accent)]"
      >
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
