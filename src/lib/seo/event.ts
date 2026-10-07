import type { Metadata } from "next";
import { routing, type Locale } from "@/i18n/routing";
import { isSessionSoldOut, t, type EventItem } from "@/lib/types";
import { EVENT_TIME_ZONE } from "@/lib/utils";

/** Adresse publique du site : celle que les moteurs doivent retenir. */
export const SITE_ORIGIN = "https://ticketick.ch";

/** Page d'un spectacle à indexer : l'accueil de ticketick s'il y est publié, sinon celle de l'organisateur. */
export function eventPath(event: Pick<EventItem, "slug" | "visibility" | "organizer">): string {
  return event.visibility === "PUBLIC"
    ? `/events/${event.slug}`
    : `/go/${event.organizer.slug}/${event.slug}`;
}

export function localizedPath(path: string, locale: string): string {
  return locale === routing.defaultLocale ? path || "/" : `/${locale}${path}`;
}

/** Adresse canonique et variantes linguistiques, pour `generateMetadata`. */
export function eventAlternates(
  event: Pick<EventItem, "slug" | "visibility" | "organizer">,
  locale: string,
): Metadata["alternates"] {
  const path = eventPath(event);
  return {
    canonical: localizedPath(path, locale),
    languages: Object.fromEntries([
      ...routing.locales.map((l: Locale) => [l, localizedPath(path, l)]),
      ["x-default", localizedPath(path, routing.defaultLocale)],
    ]),
  };
}

/** Date ISO à l'heure locale du spectacle, avec son décalage (2027-01-02T11:30:00+01:00). */
function localIso(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: EVENT_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZoneName: "longOffset",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const offset = (parts.timeZoneName ?? "GMT").replace("GMT", "") || "+00:00";
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

function absolute(url: string): string {
  return url.startsWith("http") ? url : `${SITE_ORIGIN}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * Données structurées schema.org : un `Event` par séance à venir, pour les
 * résultats « événements » des moteurs de recherche.
 */
export function eventJsonLd(event: EventItem, locale: string): Record<string, unknown>[] {
  const url = `${SITE_ORIGIN}${localizedPath(eventPath(event), locale)}`;
  const name = t(event.title, locale);
  const description = t(event.description, locale).trim().slice(0, 1000) || undefined;
  const image = [event.coverImage, ...event.gallery].filter(Boolean).map(absolute);
  const now = Date.now();

  return event.sessions
    .filter((s) => +new Date(s.endsAt ?? s.startsAt) >= now)
    .map((session) => {
      const soldOut = isSessionSoldOut(session);
      const venue = session.venue;
      const paid = session.ticketTypes.filter(
        (tt) => tt.priceCents > 0 && !tt.companionOfId && tt.maxPerPaidTicket == null,
      );
      const offers =
        event.onlineSale && paid.length
          ? paid.map((tt) => ({
              "@type": "Offer",
              name: t(tt.name, locale),
              price: (tt.priceCents / 100).toFixed(2),
              priceCurrency: tt.currency,
              availability:
                soldOut || tt.sold >= tt.quantity
                  ? "https://schema.org/SoldOut"
                  : "https://schema.org/InStock",
              url,
              ...(tt.salesEndAt ? { validThrough: localIso(tt.salesEndAt) } : {}),
            }))
          : undefined;

      return {
        "@context": "https://schema.org",
        "@type": "Event",
        name,
        description,
        image: image.length ? image : undefined,
        url,
        startDate: localIso(session.startsAt),
        endDate: localIso(session.endsAt),
        doorTime: localIso(session.doorsAt),
        eventStatus:
          session.status === "CANCELLED"
            ? "https://schema.org/EventCancelled"
            : "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: venue
          ? {
              "@type": "Place",
              name: venue.name,
              address: {
                "@type": "PostalAddress",
                streetAddress: venue.address,
                addressLocality: venue.city,
                addressRegion: venue.canton,
                addressCountry: venue.country,
              },
              ...(venue.lat != null && venue.lng != null
                ? { geo: { "@type": "GeoCoordinates", latitude: venue.lat, longitude: venue.lng } }
                : {}),
            }
          : undefined,
        organizer: {
          "@type": "Organization",
          name: event.organizer.name,
          url: event.organizer.website || `${SITE_ORIGIN}/go/${event.organizer.slug}`,
        },
        offers,
      };
    });
}

/** Contenu de la balise `<script type="application/ld+json">`, sans `<` exploitable. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
