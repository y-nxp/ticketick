import type {
  EventStatus,
  EventVisibility,
  SocialAccountStatus,
  SocialProvider,
} from "@prisma/client";
import { channelNeedsImage, channelOf, type PromotionChannel } from "./channels";
import { planPostStatus, type PostIntent, type PostStatusError } from "./post-status";
import { messageLimit } from "./preview";
import { promotability } from "./promotable";
import { isPromotionLocale, type PromotionLocale } from "./template";

/**
 * Contrôle d'une composition avant écriture (docs/module-promotion.md,
 * §§ 2.4 et 2.5), sans base : l'action serveur charge l'événement et les
 * comptes, cette fonction décide. Tout ce que le navigateur envoie est
 * revérifié ici — séance, compte, visuel, statut —, le formulaire n'étant
 * qu'une proposition.
 */

export const LANDINGS = ["go", "events"] as const;
export type Landing = (typeof LANDINGS)[number];

export const CAMPAIGN_NAME_MAX = 120;

export interface ComposeEvent {
  organizerId: string;
  status: EventStatus;
  visibility: EventVisibility;
  onlineSale: boolean;
  coverImage: string | null;
  gallery: string[];
  sessions: { id: string; startsAt: Date; status: EventStatus }[];
}

export interface ComposeAccount {
  id: string;
  organizerId: string;
  provider: SocialProvider;
  status: SocialAccountStatus;
}

export interface ComposeRequest {
  /** Vide : toutes les dates. */
  sessionId: string | null;
  locale: string;
  landing: string;
  name: string;
  accountIds: string[];
  /** Visuel choisi parmi `coverImage` et `gallery` ; vide : sans visuel. */
  image: string | null;
  body: string;
  intent: PostIntent;
  scheduledAt: Date | null;
}

export type ComposeError =
  | PostStatusError
  | "notPreparable"
  | "sessionInvalid"
  | "localeInvalid"
  | "landingInvalid"
  | "nameRequired"
  | "channelRequired"
  | "accountInvalid"
  | "imageInvalid"
  | "imageRequired"
  | "messageRequired"
  | "messageTooLong";

export interface ComposePlan {
  ok: true;
  sessionId: string | null;
  locale: PromotionLocale;
  landing: Landing;
  name: string;
  image: string | null;
  posts: { accountId: string; channel: PromotionChannel }[];
  status: "DRAFT" | "SCHEDULED";
  scheduledAt: Date | null;
}

/** Images proposables : l'affiche puis la galerie, sans doublon. */
export function eventImages(event: Pick<ComposeEvent, "coverImage" | "gallery">): string[] {
  return [...new Set([event.coverImage, ...event.gallery].filter((u): u is string => Boolean(u)))];
}

/**
 * @param messageFor texte final d'un canal (corps + ligne du lien), pour en
 *   vérifier la longueur avec le lien réel.
 */
export function checkComposition(
  event: ComposeEvent,
  accounts: ComposeAccount[],
  request: ComposeRequest,
  messageFor: (channel: PromotionChannel) => string,
  now: Date = new Date(),
): ComposePlan | { ok: false; error: ComposeError } {
  const fail = (error: ComposeError) => ({ ok: false as const, error });
  const rules = promotability(event, now);
  if (!rules.preparable) return fail("notPreparable");

  if (request.sessionId) {
    const session = event.sessions.find((s) => s.id === request.sessionId);
    const open = session?.status === "PUBLISHED" || session?.status === "SOLD_OUT";
    if (!session || !open || session.startsAt.getTime() <= now.getTime()) {
      return fail("sessionInvalid");
    }
  }
  if (!isPromotionLocale(request.locale)) return fail("localeInvalid");
  if (!(LANDINGS as readonly string[]).includes(request.landing)) return fail("landingInvalid");
  const name = request.name.trim();
  if (!name) return fail("nameRequired");

  const ids = [...new Set(request.accountIds)];
  if (ids.length === 0) return fail("channelRequired");
  const posts: ComposePlan["posts"] = [];
  for (const id of ids) {
    const account = accounts.find((a) => a.id === id);
    // Compte d'un autre organisateur que celui de l'événement, déconnecté ou
    // à reconnecter : refusé, même si l'acteur est admin.
    const channel = account ? channelOf(account.provider) : null;
    if (!account || !channel || account.organizerId !== event.organizerId || account.status !== "ACTIVE") {
      return fail("accountInvalid");
    }
    posts.push({ accountId: id, channel });
  }

  // Seules les images de l'événement : jamais un autre fichier de /uploads.
  if (request.image && !eventImages(event).includes(request.image)) return fail("imageInvalid");
  if (!request.image && posts.some((p) => channelNeedsImage(p.channel))) return fail("imageRequired");

  if (!request.body.trim()) return fail("messageRequired");
  for (const { channel } of posts) {
    if (messageFor(channel).length > messageLimit(channel)) return fail("messageTooLong");
  }

  const status = planPostStatus({
    intent: request.intent,
    scheduledAt: request.scheduledAt,
    promotable: rules.promotable,
    now,
  });
  if (!status.ok) return fail(status.error);

  return {
    ok: true,
    sessionId: request.sessionId,
    locale: request.locale,
    landing: request.landing as Landing,
    name: name.slice(0, CAMPAIGN_NAME_MAX),
    image: request.image,
    posts,
    status: status.status,
    scheduledAt: status.scheduledAt,
  };
}
