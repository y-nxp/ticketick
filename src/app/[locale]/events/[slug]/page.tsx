import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarDays, MapPin, DoorOpen, ArrowLeft, Building2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { TicketSelector } from "@/components/events/ticket-selector";
import { getAllEvents, getEventBySlug } from "@/lib/mock-data";
import { formatDate } from "@/lib/utils";
import { t } from "@/lib/types";

export function generateStaticParams() {
  return getAllEvents().map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const event = getEventBySlug(slug);
  if (!event) return {};
  return {
    title: t(event.title, locale),
    description: t(event.description, locale),
    openGraph: { images: [event.coverImage] },
  };
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const event = getEventBySlug(slug);
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

      {/* Cover */}
      <div className="relative aspect-[21/9] w-full overflow-hidden rounded-3xl">
        <Image
          src={event.coverImage}
          alt={t(event.title, locale)}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
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

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        {/* Contenu */}
        <div className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <InfoCard
              icon={<CalendarDays className="size-5 text-primary" />}
              label={te("dateAndTime")}
              value={formatDate(event.startsAt, `${locale}-CH`)}
            />
            <InfoCard
              icon={<MapPin className="size-5 text-primary" />}
              label={te("location")}
              value={`${event.venue.name}, ${event.venue.city}`}
              hint={event.venue.address}
            />
            {event.doorsAt && (
              <InfoCard
                icon={<DoorOpen className="size-5 text-primary" />}
                label={te("doors")}
                value={formatDate(event.doorsAt, `${locale}-CH`, {
                  weekday: undefined,
                  hour: "2-digit",
                  minute: "2-digit",
                  day: undefined,
                  month: undefined,
                  year: undefined,
                })}
              />
            )}
            <InfoCard
              icon={<Building2 className="size-5 text-primary" />}
              label={te("organizer")}
              value={event.organizer.name}
            />
          </div>

          <section>
            <h2 className="mb-3 text-xl font-semibold">{te("about")}</h2>
            <p className="leading-relaxed text-muted-foreground">
              {t(event.description, locale)}
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">{te("categories")}</h2>
            <div className="flex flex-wrap gap-2">
              {event.categories.map((c) => (
                <Badge key={c.id} variant="outline">
                  {t(c.name, locale)}
                </Badge>
              ))}
            </div>
          </section>

          {/* Map */}
          <section>
            <h2 className="mb-3 text-xl font-semibold">{te("map")}</h2>
            {event.hasMap && event.venue.lat && event.venue.lng ? (
              <div className="overflow-hidden rounded-2xl border border-border">
                <iframe
                  title={event.venue.name}
                  className="h-72 w-full"
                  loading="lazy"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${
                    event.venue.lng - 0.01
                  }%2C${event.venue.lat - 0.006}%2C${
                    event.venue.lng + 0.01
                  }%2C${event.venue.lat + 0.006}&layer=mapnik&marker=${
                    event.venue.lat
                  }%2C${event.venue.lng}`}
                />
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                {te("noMap")}
              </p>
            )}
          </section>
        </div>

        {/* Sidebar billets */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <TicketSelector event={event} locale={locale} />
        </aside>
      </div>
    </div>
  );
}

function InfoCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="mt-0.5">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="font-medium">{value}</p>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
