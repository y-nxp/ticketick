import Image from "next/image";
import { CalendarDays, MapPin } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatPrice } from "@/lib/utils";
import { isSoldOut, minPriceCents, t, type EventItem } from "@/lib/types";

export function EventCard({
  event,
  locale,
  labels,
}: {
  event: EventItem;
  locale: string;
  labels: { from: string; soldOut: string };
}) {
  const soldOut = isSoldOut(event);
  const price = minPriceCents(event);

  return (
    <Link
      href={`/events/${event.slug}`}
      // En mode sombre l'ombre noire est invisible : le relief au survol
      // est porté par un halo violet et une bordure accentuée.
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-black/5 dark:hover:border-primary/40 dark:hover:shadow-primary/20"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <Image
          src={event.coverImage}
          alt={t(event.title, locale)}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {event.categories.slice(0, 2).map((c) => (
            <span
              key={c.id}
              className="rounded-full px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm"
              style={{ backgroundColor: `${c.color}dd` }}
            >
              {t(c.name, locale)}
            </span>
          ))}
        </div>
        {soldOut && (
          <div className="absolute right-3 top-3">
            <Badge variant="solid">{labels.soldOut}</Badge>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-base font-semibold leading-snug group-hover:text-primary transition-colors">
          {t(event.title, locale)}
        </h3>
        <div className="mt-auto space-y-1.5 pt-2 text-sm text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <CalendarDays className="size-4 shrink-0" />
            {formatDate(event.startsAt, `${locale}-CH`, {
              weekday: undefined,
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <p className="flex items-center gap-1.5">
            <MapPin className="size-4 shrink-0" />
            {event.venue.name}, {event.venue.city}
          </p>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">{labels.from}</span>
          <span className="text-base font-bold">
            {formatPrice(price, `${locale}-CH`)}
          </span>
        </div>
      </div>
    </Link>
  );
}
