import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { EventBooking } from "@/components/events/event-booking";
import { getEventBySlug } from "@/lib/data/events";
import { t } from "@/lib/types";

// Le stock évolue en continu : la page est rendue à la demande plutôt que
// figée au build, où la base n'est de toute façon pas joignable.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) return {};
  return {
    title: t(event.title, locale),
    description: t(event.description, locale),
    openGraph: event.coverImage ? { images: [event.coverImage] } : undefined,
  };
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const event = await getEventBySlug(slug);
  if (!event) notFound();

  const te = await getTranslations("event");

  return (
    <div className="container-page py-8">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {te("backToEvents")}
      </Link>

      <div className="relative aspect-[21/9] w-full overflow-hidden rounded-3xl">
        {event.coverImage && (
          <Image
            src={event.coverImage}
            alt={t(event.title, locale)}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
          <div className="mb-3 flex flex-wrap gap-2">
            {event.categories.map((c) => (
              <span
                key={c.id}
                className="rounded-full px-3 py-1 text-xs font-medium text-white backdrop-blur-sm"
                style={{ backgroundColor: `${c.color}dd` }}
              >
                {t(c.name, locale)}
              </span>
            ))}
          </div>
          <h1 className="max-w-3xl text-3xl font-bold text-white drop-shadow sm:text-5xl">
            {t(event.title, locale)}
          </h1>
        </div>
      </div>

      <div className="mt-8">
        <EventBooking event={event} locale={locale} />
      </div>
    </div>
  );
}
