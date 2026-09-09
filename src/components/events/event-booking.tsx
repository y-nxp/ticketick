"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, MapPin, DoorOpen, Building2 } from "lucide-react";
import { SessionPicker } from "./session-picker";
import { TicketSelector } from "./ticket-selector";
import { formatDate } from "@/lib/utils";
import { t, upcomingSessions, type EventItem } from "@/lib/types";

/**
 * Bloc réservation de la page événement.
 *
 * Regroupe le choix de séance, les informations pratiques et la sélection de
 * billets dans un seul composant : date, lieu, plan d'accès et tarifs
 * dépendent tous de la séance retenue et doivent donc partager le même état.
 */
export function EventBooking({
  event,
  locale,
}: {
  event: EventItem;
  locale: string;
}) {
  const te = useTranslations("event");

  // À venir en priorité ; si tout est passé, on retombe sur l'historique
  // pour que la page reste consultable.
  const sessions = React.useMemo(() => {
    const upcoming = upcomingSessions(event);
    return upcoming.length ? upcoming : event.sessions;
  }, [event]);

  const [selectedId, setSelectedId] = React.useState(() => sessions[0]?.id);
  const session = sessions.find((s) => s.id === selectedId) ?? sessions[0];

  if (!session) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        {te("noSessions")}
      </p>
    );
  }

  const venue = session.venue;
  const showMap = Boolean(venue?.lat && venue?.lng);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-2">
          <InfoCard
            icon={<CalendarDays className="size-5 text-primary" />}
            label={te("dateAndTime")}
            value={formatDate(session.startsAt, `${locale}-CH`)}
            hint={session.label ? t(session.label, locale) : undefined}
          />
          {venue && (
            <InfoCard
              icon={<MapPin className="size-5 text-primary" />}
              label={te("location")}
              value={`${venue.name}, ${venue.city}`}
              hint={venue.address}
            />
          )}
          {session.doorsAt && (
            <InfoCard
              icon={<DoorOpen className="size-5 text-primary" />}
              label={te("doors")}
              value={new Date(session.doorsAt).toLocaleTimeString(
                `${locale}-CH`,
                { hour: "2-digit", minute: "2-digit" },
              )}
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

        {event.categories.length > 0 && (
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
        )}

        <section>
          <h2 className="mb-3 text-xl font-semibold">{te("map")}</h2>
          {showMap && venue ? (
            <div className="overflow-hidden rounded-2xl border border-border">
              <iframe
                title={venue.name}
                className="h-72 w-full"
                loading="lazy"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${
                  venue.lng! - 0.01
                }%2C${venue.lat! - 0.006}%2C${venue.lng! + 0.01}%2C${
                  venue.lat! + 0.006
                }&layer=mapnik&marker=${venue.lat}%2C${venue.lng}`}
              />
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
              {te("noMap")}
            </p>
          )}
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <SessionPicker
          sessions={sessions}
          selectedId={session.id}
          onSelect={setSelectedId}
          locale={locale}
        />
        <TicketSelector
          event={event}
          session={session}
          locale={locale}
          // Remonter le sélecteur à chaque changement de séance évite de
          // conserver des quantités choisies pour une autre date.
          key={session.id}
        />
      </aside>
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
