import type * as React from "react";
import Image from "next/image";
import { CalendarDays, MapPin, Ticket } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { EventTags } from "@/components/events/event-tags";
import { formatDate, formatPrice } from "@/lib/utils";
import {
  eventTags,
  isSoldOut,
  minPriceCents,
  nextSession,
  t,
  upcomingSessions,
  type EventItem,
} from "@/lib/types";

// En mode sombre l'ombre noire est invisible : le relief au survol est porté
// par un halo violet et une bordure accentuée.
export const eventCardClass =
  "group flex flex-col overflow-hidden rounded-card border border-border bg-card transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-black/5 dark:hover:border-primary/40 dark:hover:shadow-primary/20";

export function EventCard({
  event,
  locale,
  labels,
  href = `/events/${event.slug}`,
  imagePriority,
}: {
  event: EventItem;
  locale: string;
  labels: {
    from: string;
    soldOut: string;
    dates: (n: number) => string;
    onRegistration: string;
    salesPaused: string;
  };
  /** Page de l'organisateur : la carte y mène à sa propre fiche. */
  href?: string;
  /** Cartes visibles dès l'ouverture : photo chargée sans attendre, la première en priorité. */
  imagePriority?: "high" | "eager";
}) {
  // La carte annonce la prochaine séance ; le nombre de dates restantes
  // signale les spectacles joués plusieurs fois.
  const session = nextSession(event);
  return (
    <Link href={href} className={eventCardClass}>
      <EventCardContent
        locale={locale}
        title={t(event.title, locale)}
        coverImage={event.coverImage}
        startsAt={session?.startsAt}
        venue={session?.venue ? `${session.venue.name}, ${session.venue.city}` : undefined}
        categories={event.categories.map((c) => ({
          id: c.id,
          name: t(c.name, locale),
          color: c.color,
        }))}
        tags={eventTags(event, locale)}
        soldOut={isSoldOut(event)}
        soldOutLabel={labels.soldOut}
        badge={
          upcomingSessions(event).length > 1
            ? labels.dates(upcomingSessions(event).length)
            : undefined
        }
        imagePriority={imagePriority}
        footer={
          event.salesPaused ? (
            <span className="text-sm font-medium">{labels.salesPaused}</span>
          ) : event.onlineSale ? (
            <>
              <span className="text-xs text-muted-foreground">{labels.from}</span>
              <span className="text-base font-bold">
                {formatPrice(minPriceCents(event), `${locale}-CH`)}
              </span>
            </>
          ) : (
            <span className="text-sm font-medium">{labels.onRegistration}</span>
          )
        }
      />
    </Link>
  );
}

/** Intérieur de la carte, partagé avec les cartes à sélectionner (échange de billets). */
export function EventCardContent({
  locale,
  title,
  coverImage,
  startsAt,
  venue,
  categories,
  tags,
  soldOut,
  soldOutLabel,
  badge,
  imagePriority,
  footer,
}: {
  locale: string;
  title: string;
  coverImage: string;
  startsAt?: string | Date;
  venue?: string;
  categories: { id: string; name: string; color: string }[];
  tags: string[];
  soldOut: boolean;
  soldOutLabel: string;
  /** Pastille après la date (« 3 dates »). */
  badge?: string;
  imagePriority?: "high" | "eager";
  footer: React.ReactNode;
}) {
  const fmt = (options: Intl.DateTimeFormatOptions) =>
    startsAt
      ? formatDate(startsAt, `${locale}-CH`, {
          weekday: undefined,
          day: undefined,
          month: undefined,
          year: undefined,
          hour: undefined,
          minute: undefined,
          ...options,
        })
      : "";

  return (
    <>
      <div className="relative aspect-[4/3] overflow-hidden">
        {coverImage ? (
          <Image
            src={coverImage}
            alt={title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            loading={imagePriority ? "eager" : undefined}
            fetchPriority={imagePriority === "high" ? "high" : undefined}
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid size-full place-items-center bg-primary/10 text-primary">
            <Ticket className="size-10" aria-hidden />
          </div>
        )}
        {startsAt ? (
          // La date lisible reste sous le titre ; ce bloc la répète en grand.
          <div
            aria-hidden
            className="absolute left-0 top-0 flex min-w-[4.5rem] flex-col items-center rounded-br-card px-3 pb-2 pt-1.5 leading-none shadow-md"
            style={{
              backgroundColor: "var(--brand-accent, var(--foreground))",
              color: "var(--background)",
            }}
          >
            <span className="brand-label text-[11px] font-medium uppercase tracking-wider">
              {fmt({ weekday: "short" })}
            </span>
            <span className="mt-0.5 text-3xl font-extrabold tabular-nums">
              {fmt({ day: "numeric" }).replace(/\.$/, "")}
            </span>
            <span className="brand-label mt-1 text-[11px] font-medium uppercase tracking-wider">
              {fmt({ month: "short" })}
            </span>
          </div>
        ) : null}
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5">
          {categories.slice(0, 2).map((c) => (
            <span
              key={c.id}
              className="brand-label rounded-full px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm"
              style={{ backgroundColor: `${c.color}dd` }}
            >
              {c.name}
            </span>
          ))}
        </div>
        {soldOut && (
          <div className="absolute right-3 top-3">
            <Badge variant="solid">{soldOutLabel}</Badge>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <EventTags tags={tags} />
        <h3 className="line-clamp-2 text-base font-semibold leading-snug group-hover:text-primary transition-colors">
          {title}
        </h3>
        <div className="mt-auto space-y-1.5 pt-2 text-sm text-muted-foreground">
          {startsAt && (
            <p className="flex items-center gap-1.5">
              <CalendarDays className="size-4 shrink-0" />
              {formatDate(startsAt, `${locale}-CH`, {
                weekday: undefined,
                hour: "2-digit",
                minute: "2-digit",
              })}
              {badge && (
                <span className="brand-label shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {badge}
                </span>
              )}
            </p>
          )}
          {venue && (
            <p className="flex items-center gap-1.5">
              <MapPin className="size-4 shrink-0" />
              {venue}
            </p>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border pt-3">
          {footer}
        </div>
      </div>
    </>
  );
}
