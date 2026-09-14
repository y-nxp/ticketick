import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { EmbedFrame } from "@/components/embed/embed-frame";
import { EventBooking } from "@/components/events/event-booking";
import { getEventBySlug } from "@/lib/data/events";
import { t } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) return { robots: { index: false, follow: false } };
  return {
    title: t(event.title, locale),
    robots: { index: false, follow: true },
  };
}

export default async function EmbedEventPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const event = await getEventBySlug(slug);
  if (!event) notFound();

  return (
    <EmbedFrame>
      <p className="mb-3 text-sm font-semibold">{t(event.title, locale)}</p>
      <EventBooking event={event} locale={locale} variant="widget" />
    </EmbedFrame>
  );
}
