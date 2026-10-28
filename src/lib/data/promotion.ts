import "server-only";

import { notFound } from "next/navigation";
import { catalogActor, forbidIfForeignEvent, statsActor } from "@/lib/admin/access";
import { publicAppOrigin } from "@/lib/app-url";
import { statsOrganizerOf } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { campaignAccess } from "@/lib/promotion/access";
import { CAMPAIGN_CODE_LENGTH } from "@/lib/promotion/campaign-code";
import { channelOf } from "@/lib/promotion/channels";
import { eventImages } from "@/lib/promotion/compose";
import { isPostEditable } from "@/lib/promotion/post-status";
import { promotability } from "@/lib/promotion/promotable";
import { campaignState, emptyFigures } from "@/lib/promotion/results";
import { loadCampaignDetail, loadCampaignFigures } from "@/lib/promotion/results-store";
import { PROMOTION_LOCALES, type PromotionLocale } from "@/lib/promotion/template";
import { localizedPath } from "@/lib/seo/event";
import { minPriceCents, type Translated } from "@/lib/types";

/**
 * Lectures du module Promotion (docs/module-promotion.md, § 2).
 *
 * Comme le reste de `lib/data`, le contrôle des droits est porté par l'accès
 * à la donnée : lecture par `statsActor()` (le responsable invité voit, sans
 * agir), composition par `catalogActor()` et `forbidIfForeignEvent`. Aucun
 * jeton ne sort d'ici : les comptes sociaux ne sont lus que par leurs champs
 * d'affichage.
 */

const accountDisplay = {
  id: true,
  organizerId: true,
  provider: true,
  name: true,
  username: true,
  status: true,
} as const;

function translated(value: unknown): Translated | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<Translated>;
  if (!v.fr?.trim()) return null;
  const fr = v.fr;
  return { fr, en: v.en || fr, de: v.de || fr, it: v.it || fr };
}

/** Comptes Facebook / Instagram d'un organisateur, pour le compositeur. */
async function organizerAccounts(organizerId: string) {
  const rows = await prisma.organizerSocialAccount.findMany({
    where: { organizerId, provider: { in: ["FACEBOOK_PAGE", "INSTAGRAM_BUSINESS"] } },
    orderBy: [{ provider: "asc" }, { name: "asc" }],
    select: accountDisplay,
  });
  return rows.flatMap((a) => {
    const channel = channelOf(a.provider);
    return channel ? [{ ...a, channel }] : [];
  });
}

/** Tout ce qu'il faut au compositeur, pour un événement de l'acteur. */
export async function getComposerData(eventId: string) {
  const { organizerId: scoped } = await catalogActor();
  await forbidIfForeignEvent(eventId, scoped);

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      slug: true,
      title: true,
      subtitle: true,
      tags: true,
      status: true,
      visibility: true,
      onlineSale: true,
      coverImage: true,
      gallery: true,
      organizerId: true,
      organizer: { select: { name: true, slug: true } },
      sessions: {
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          startsAt: true,
          status: true,
          label: true,
          venue: { select: { name: true, city: true } },
          ticketTypes: { select: { priceCents: true } },
        },
      },
    },
  });
  if (!event) notFound();

  const now = new Date();
  const rules = promotability(event, now);
  // Mêmes séances que `promotability` : à venir, publiées ou complètes.
  const upcoming = event.sessions.filter(
    (s) =>
      s.startsAt.getTime() > now.getTime() && (s.status === "PUBLISHED" || s.status === "SOLD_OUT"),
  );

  // Langue → chemin de la page d'arrivée, préfixe compris (`localizedPath`),
  // tel que `/p/{code}` y redirigera (`landingPath`).
  const goPath = `/go/${event.organizer.slug}/${event.slug}`;
  const eventsPath = event.visibility === "PUBLIC" ? `/events/${event.slug}` : null;
  const arrival = Object.fromEntries(
    PROMOTION_LOCALES.map((l) => [
      l,
      { go: localizedPath(goPath, l), events: eventsPath ? localizedPath(eventsPath, l) : null },
    ]),
  ) as Record<PromotionLocale, { go: string; events: string | null }>;

  return {
    event: {
      id: event.id,
      organizerId: event.organizerId,
      organizerName: event.organizer.name,
      title: translated(event.title) ?? { fr: "", en: "", de: "", it: "" },
      subtitle: translated(event.subtitle),
      tags: translated(event.tags),
      visibility: event.visibility,
      onlineSale: event.onlineSale,
      images: eventImages(event),
      coverImage: event.coverImage,
    },
    sessions: upcoming.map((s) => ({
      id: s.id,
      startsAt: s.startsAt.toISOString(),
      label: translated(s.label),
      venue: s.venue,
      priceCents: minPriceCents({ sessions: [s] }),
    })),
    /** Prix d'appel de toutes les dates à venir. */
    allDatesPriceCents: minPriceCents({ sessions: upcoming }),
    /** Prochaine séance (`nextSession()`), proposée par défaut. */
    defaultSessionId: upcoming[0]?.id ?? null,
    promotability: rules,
    accounts: await organizerAccounts(event.organizerId),
    origin: publicAppOrigin(),
    /**
     * Le code du lien n'existe qu'à la création : l'aperçu montre sa place,
     * à la bonne longueur. Calculé ici, `campaign-code.ts` (node:crypto)
     * n'ayant rien à faire dans le navigateur.
     */
    codePlaceholder: "•".repeat(CAMPAIGN_CODE_LENGTH),
    arrival,
  };
}

export type ComposerData = Awaited<ReturnType<typeof getComposerData>>;

const postListSelect = {
  id: true,
  status: true,
  scheduledAt: true,
  publishedAt: true,
  permalink: true,
  lastError: true,
  claimedAt: true,
  linkUrl: true,
  createdAt: true,
  account: { select: { provider: true, name: true } },
  campaign: {
    select: {
      id: true,
      name: true,
      code: true,
      event: { select: { id: true, title: true } },
    },
  },
} as const;

/** Campagnes de la liste, par pas de 50 (« voir plus »), jamais plus de 500. */
export const CAMPAIGN_PAGE = 50;
const CAMPAIGN_MAX = 500;

export function campaignListLimit(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= CAMPAIGN_PAGE) return CAMPAIGN_PAGE;
  return Math.min(CAMPAIGN_MAX, Math.ceil(n / CAMPAIGN_PAGE) * CAMPAIGN_PAGE);
}

/** Écran `/admin/promotion` : comptes, publications, campagnes et leurs chiffres. */
export async function getPromotionOverview(campaignLimit = CAMPAIGN_PAGE) {
  const { organizerId, readOnly } = await statsActor();
  const where = organizerId ? { organizerId } : undefined;

  const [accounts, posts, campaigns] = await Promise.all([
    prisma.organizerSocialAccount.findMany({
      where,
      orderBy: [{ organizer: { name: "asc" } }, { provider: "asc" }],
      select: { ...accountDisplay, organizer: { select: { name: true } } },
    }),
    prisma.promotionPost.findMany({
      where: organizerId ? { campaign: { organizerId } } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
      select: postListSelect,
    }),
    prisma.promotionCampaign.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      // Un de plus : savoir s'il reste des campagnes à montrer.
      take: campaignLimit + 1,
      select: {
        id: true,
        name: true,
        code: true,
        locale: true,
        createdAt: true,
        organizerId: true,
        eventId: true,
        organizer: { select: { name: true } },
        event: { select: { id: true, title: true } },
        posts: { select: { status: true } },
      },
    }),
  ]);
  const shown = campaigns.slice(0, campaignLimit);
  const figures = await loadCampaignFigures(shown);

  return {
    readOnly,
    showOrganizer: organizerId === null,
    accounts,
    posts: posts.map((p) => ({ ...p, editable: !readOnly && isPostEditable(p) })),
    campaigns: shown.map(({ posts: campaignPosts, ...c }) => ({
      ...c,
      postCount: campaignPosts.length,
      state: campaignState(campaignPosts.map((p) => p.status)),
      figures: figures.get(c.id) ?? emptyFigures(),
    })),
    moreCampaigns: campaigns.length > campaignLimit && campaignLimit < CAMPAIGN_MAX,
    campaignLimit,
    origin: publicAppOrigin(),
  };
}

/**
 * Page des résultats d'une campagne (§ 5.3). Lecture par `statsActor()` et
 * `campaignAccess` : l'admin lit tout, l'organisateur et ses responsables
 * invités la leur ; celle d'un autre organisateur est introuvable.
 */
export async function getPromotionCampaign(id: string) {
  const { user } = await statsActor();

  const campaign = await prisma.promotionCampaign.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      code: true,
      locale: true,
      kind: true,
      createdAt: true,
      organizerId: true,
      eventId: true,
      sessionId: true,
      organizer: { select: { name: true } },
      event: { select: { id: true, title: true } },
      posts: {
        orderBy: [{ publishedAt: "asc" }, { scheduledAt: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          status: true,
          scheduledAt: true,
          publishedAt: true,
          permalink: true,
          linkUrl: true,
          lastError: true,
          account: { select: { provider: true, name: true } },
        },
      },
    },
  });
  const access = campaign ? campaignAccess(user, campaign.organizerId) : null;
  if (!campaign || !access) notFound();

  const detail = await loadCampaignDetail(campaign);
  const published = campaign.posts
    .map((p) => p.publishedAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  return {
    campaign,
    detail,
    state: campaignState(campaign.posts.map((p) => p.status)),
    firstPublishedAt: published[0] ?? null,
    readOnly: access.readOnly,
    showOrganizer: statsOrganizerOf(user) === null,
    origin: publicAppOrigin(),
  };
}

export type PromotionCampaignView = Awaited<ReturnType<typeof getPromotionCampaign>>;

/** Comptes connectés (écran `/admin/promotion/comptes`). */
export async function getPromotionAccounts() {
  const { organizerId } = await statsActor();
  return prisma.organizerSocialAccount.findMany({
    where: organizerId ? { organizerId } : undefined,
    orderBy: [{ organizer: { name: "asc" } }, { provider: "asc" }],
    select: { ...accountDisplay, connectedAt: true, organizer: { select: { name: true } } },
  });
}

/** Une publication, pour la consulter ou la modifier. */
export async function getPromotionPost(id: string) {
  const { organizerId, readOnly } = await statsActor();

  const post = await prisma.promotionPost.findUnique({
    where: { id },
    select: {
      ...postListSelect,
      message: true,
      imagePath: true,
      account: { select: { provider: true, name: true, username: true } },
      campaign: {
        select: {
          id: true,
          name: true,
          code: true,
          locale: true,
          organizerId: true,
          event: {
            select: {
              id: true,
              title: true,
              status: true,
              visibility: true,
              onlineSale: true,
              sessions: { select: { startsAt: true, status: true } },
            },
          },
        },
      },
    },
  });
  // Publication d'un autre organisateur : introuvable, sans dire qu'elle existe.
  if (!post || (organizerId && post.campaign.organizerId !== organizerId)) notFound();

  const channel = channelOf(post.account.provider);
  if (!channel) notFound();
  return {
    ...post,
    channel,
    readOnly,
    editable: !readOnly && isPostEditable(post),
    promotable: promotability(post.campaign.event).promotable,
  };
}

export type PromotionPostView = Awaited<ReturnType<typeof getPromotionPost>>;

/** Section « Promouvoir » de la fiche événement. */
export async function getEventPromotion(eventId: string) {
  const { organizerId } = await statsActor();
  await forbidIfForeignEvent(eventId, organizerId);

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      organizerId: true,
      status: true,
      visibility: true,
      onlineSale: true,
      sessions: { select: { startsAt: true, status: true } },
    },
  });
  if (!event) return null;

  const [activeAccounts, posts] = await Promise.all([
    prisma.organizerSocialAccount.count({
      where: {
        organizerId: event.organizerId,
        status: "ACTIVE",
        provider: { in: ["FACEBOOK_PAGE", "INSTAGRAM_BUSINESS"] },
      },
    }),
    prisma.promotionPost.findMany({
      where: { campaign: { eventId } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: postListSelect,
    }),
  ]);

  return { promotability: promotability(event), activeAccounts, posts };
}
