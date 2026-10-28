import type { EventVisibility } from "@prisma/client";
import { routing } from "@/i18n/routing";
import { localizedPath } from "@/lib/seo/event";
import { EVENT_TIME_ZONE } from "@/lib/utils";
import { campaignUtm } from "./campaign-code";
import type { PromotionSource } from "./source";

/**
 * Page d'arrivée d'un clic sur `/p/{code}` (docs/module-promotion.md, § 5.1) :
 * la page de l'événement, dans la langue de la campagne, avec les UTM que
 * l'organisateur retrouve dans son GA4 ou son Matomo.
 */

export interface LandingCampaign {
  code: string;
  locale: string;
  /** "go" (/go/org/event) ou "events" (/events/slug). */
  landing: string;
  event: {
    slug: string;
    visibility: EventVisibility;
    organizer: { slug: string };
  };
}

export interface LandingClick {
  source: PromotionSource;
  /** Identifiant de la publication, repris en `utm_content`. */
  postId?: string | null;
}

/**
 * Chemin relatif de la redirection. `/events/{slug}` n'affiche qu'un
 * événement public : pour les autres, on retombe sur `/go/…` plutôt que sur
 * une page introuvable.
 */
export function landingPath(campaign: LandingCampaign, click: LandingClick): string {
  const { event } = campaign;
  const base =
    campaign.landing === "events" && event.visibility === "PUBLIC"
      ? `/events/${encodeURIComponent(event.slug)}`
      : `/go/${encodeURIComponent(event.organizer.slug)}/${encodeURIComponent(event.slug)}`;
  const locale = (routing.locales as readonly string[]).includes(campaign.locale)
    ? campaign.locale
    : routing.defaultLocale;

  const query = new URLSearchParams({
    utm_source: click.source,
    utm_medium: "social",
    utm_campaign: campaignUtm(campaign.code),
  });
  if (click.postId) query.set("utm_content", click.postId);

  return `${localizedPath(base, locale)}?${query}`;
}

const zurichDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: EVENT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Jour du clic à Zurich (`AAAA-MM-JJ`), pour `PromotionClickDay.day` : les
 * journées sont celles de l'organisateur, pas celles d'UTC.
 */
export function clickDay(at: Date): string {
  return zurichDay.format(at);
}
