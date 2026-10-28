import type { Prisma, PrismaClient, PromotionPostStatus } from "@prisma/client";
import { createTranslator } from "next-intl";
import de from "../../../messages/de.json";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import it from "../../../messages/it.json";
import { byLocale, intlLocale } from "@/lib/i18n-fallback";
import { t as tr, type Translated } from "@/lib/types";
import { EVENT_TIME_ZONE } from "@/lib/utils";
import { channelOf } from "./channels";
import { logPostAction, type PostLogEntry, type PostLogSink } from "./log";
import { promotability, type PromotableEvent, type PromotionBlocker } from "./promotable";
import {
  PromotionProviderError,
  resolveProvider,
  type PromotionProvider,
  type PublishAccount,
} from "./provider";
import { postsPerWindow, rateDecision, rateWindowStart } from "./rate-limit";

/**
 * Minuterie de publication (docs/module-promotion.md, §§ 2.5 et 3.4).
 *
 * Chaque minute, un passage :
 * 1. marque `FAILED` les publications restées `PUBLISHING` plus de 15 minutes
 *    (état inconnu chez la plateforme : jamais de nouvelle tentative seule) ;
 * 2. pour chaque publication `SCHEDULED` dont l'heure est atteinte : choisit
 *    l'éditeur (sans éditeur, elle attend), applique la limite de débit du
 *    compte, puis la **réserve** par un `updateMany` conditionnel
 *    (SCHEDULED → PUBLISHING) ; seule la minuterie qui obtient `count === 1`
 *    continue. L'éditeur n'est jamais appelé avant la réservation ;
 * 3. revérifie que l'événement est encore promouvable et que le compte est
 *    actif, puis appelle l'éditeur et écrit l'issue.
 *
 * Toute écriture d'état est conditionnelle (statut et réservation attendus) :
 * relancer la minuterie, ou en faire tourner deux, ne publie rien deux fois
 * et n'envoie pas deux courriels.
 *
 * La logique ne dépend que de `PublisherStore`, branché sur Prisma par
 * `prismaPublisherStore` et sur un double en mémoire dans les tests.
 */

const MESSAGES = { fr, en, de, it };
const MINUTE_MS = 60 * 1000;

export const PUBLISH_INTERVAL_MS = MINUTE_MS;
/** Au-delà, une publication `PUBLISHING` est considérée comme orpheline. */
export const ORPHAN_AFTER_MS = 15 * MINUTE_MS;
/** Délais avant chaque nouvelle tentative après une erreur transitoire : trois au plus. */
export const RETRY_DELAYS_MS = [5 * MINUTE_MS, 15 * MINUTE_MS, 45 * MINUTE_MS] as const;
/** Appels à l'éditeur au plus : le premier, puis une nouvelle tentative par délai. */
export const MAX_PUBLISH_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
/** Publications traitées par passage ; le reste attend la minute suivante. */
const BATCH_SIZE = 20;

// ─── Données ───────────────────────────────────────────────────────────────

export interface DuePost {
  id: string;
  account: Pick<PublishAccount, "id" | "provider" | "externalId">;
}

/** Publication relue après la réservation, avec ce que vérifie la garde. */
export interface PostForPublish {
  id: string;
  status: PromotionPostStatus;
  message: string;
  imagePath: string | null;
  linkUrl: string;
  attempts: number;
  scheduledAt: Date | null;
  claimedAt: Date | null;
  account: PublishAccount & { name: string };
  campaign: {
    name: string;
    event: PromotableEvent & { title: unknown };
    organizer: {
      id: string;
      name: string;
      notifyEmails: string[];
      reportEmails: string[];
      locale: string | null;
    };
  };
}

export interface PostWhere {
  id: string;
  status: PromotionPostStatus | PromotionPostStatus[];
  /** Réservation attendue ; `null` : aucune. */
  claimedAt?: Date | null;
  /** Heure atteinte. */
  scheduledAtLte?: Date;
}

export interface PostUpdate {
  status?: PromotionPostStatus;
  scheduledAt?: Date;
  claimedAt?: Date | null;
  attempts?: number;
  lastError?: string | null;
  externalId?: string;
  permalink?: string | null;
  publishedAt?: Date;
}

export interface PublisherStore {
  listOrphans(claimedBefore: Date): Promise<{ id: string; claimedAt: Date }[]>;
  listDue(now: Date, limit: number): Promise<DuePost[]>;
  /** `updateMany` conditionnel : nombre de lignes modifiées, 0 ou 1. */
  updatePost(where: PostWhere, data: PostUpdate): Promise<number>;
  loadPost(id: string): Promise<PostForPublish | null>;
  /** Heures de publication (ou de réservation en cours) sur ce compte depuis `since`. */
  recentPublishTimes(accountId: string, since: Date): Promise<Date[]>;
  markAccountNeedsReconnect(accountId: string, lastError: string): Promise<void>;
  /** La publication a-t-elle déjà été marquée orpheline ? */
  wasOrphaned(postId: string): Promise<boolean>;
  writeLog: PostLogSink;
}

// ─── Motifs ────────────────────────────────────────────────────────────────

export type FailureReason =
  | { code: "orphaned" }
  | { code: "token" }
  | { code: "accountInactive" }
  | { code: "transient"; attempts: number }
  | { code: "permanent" }
  | { code: "unexpected" }
  | { code: "notPromotable"; blockers: PromotionBlocker[] };

/** Que conseiller à l'organisateur. */
function adviceFor(reason: FailureReason): "check" | "reconnect" | "retry" | "review" | "none" {
  switch (reason.code) {
    case "orphaned":
      return "check";
    case "token":
    case "accountInactive":
      return "reconnect";
    case "permanent":
      return "review";
    case "notPromotable":
      return "none";
    default:
      return "retry";
  }
}

function pickLocale(preferred: string | null): keyof typeof MESSAGES {
  return preferred && preferred in MESSAGES ? (preferred as keyof typeof MESSAGES) : "fr";
}

function translator(locale: keyof typeof MESSAGES) {
  return createTranslator({
    locale,
    messages: byLocale(MESSAGES, locale),
    namespace: "promotionPublisher",
  });
}

/** Motif lisible, dans la langue de l'organisateur : `lastError` et courriel. */
export function reasonText(reason: FailureReason, preferredLocale: string | null): string {
  const locale = pickLocale(preferredLocale);
  const t = translator(locale);
  switch (reason.code) {
    case "transient":
      return t("reason.transient", { attempts: reason.attempts });
    case "notPromotable": {
      const blockers = byLocale(MESSAGES, locale).admin.promotion.blockers as Record<string, string>;
      return t("reason.notPromotable", {
        reasons: reason.blockers.map((b) => blockers[b] ?? b).join(", "),
      });
    }
    default:
      return t(`reason.${reason.code}`);
  }
}

// ─── Courriel ──────────────────────────────────────────────────────────────

/** Contenu déjà traduit du courriel d'échec (`sendPromotionFailureEmail`). */
export interface FailureEmail {
  postId: string;
  organizer: { notifyEmails: string[]; reportEmails: string[] };
  subject: string;
  heading: string;
  facts: { label: string; value: string }[];
  reasonTitle: string;
  reason: string;
  actionTitle: string;
  action: string;
  link: { url: string; button: string };
  footer: string;
}

export function buildFailureEmail(
  post: PostForPublish,
  reason: FailureReason,
  options: { origin: string },
): FailureEmail {
  const locale = pickLocale(post.campaign.organizer.locale);
  const t = translator(locale);
  const ui = byLocale(MESSAGES, locale).admin.promotion;
  const channelKey = channelOf(post.account.provider);
  const channel = channelKey ? ui.channel[channelKey] : ui.accounts.provider[post.account.provider];
  const event = tr(post.campaign.event.title as Translated, locale);
  const cancelled = reason.code === "notPromotable";
  const when = post.scheduledAt
    ? new Intl.DateTimeFormat(intlLocale(locale), {
        timeZone: EVENT_TIME_ZONE,
        weekday: "short",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(post.scheduledAt)
    : "–";
  return {
    postId: post.id,
    organizer: {
      notifyEmails: post.campaign.organizer.notifyEmails,
      reportEmails: post.campaign.organizer.reportEmails,
    },
    subject: t(cancelled ? "subjectCancelled" : "subjectFailed", { channel, event }),
    heading: t(cancelled ? "headingCancelled" : "headingFailed"),
    facts: [
      { label: t("event"), value: event },
      { label: t("campaign"), value: post.campaign.name },
      { label: t("channel"), value: `${channel} · ${post.account.name}` },
      { label: t("scheduledFor"), value: when },
    ],
    reasonTitle: t("reasonTitle"),
    reason: reasonText(reason, locale),
    actionTitle: t("actionTitle"),
    action: t(`action.${adviceFor(reason)}`),
    link: {
      url: `${options.origin.replace(/\/$/, "")}/${locale}/admin/promotion/publications/${post.id}`,
      button: t("button"),
    },
    footer: t("footer"),
  };
}

// ─── Passage ───────────────────────────────────────────────────────────────

export interface PublisherDeps {
  store: PublisherStore;
  /** Point d'accrochage des éditeurs (`resolveProvider`, `provider.ts`). */
  resolveProvider: (account: DuePost["account"]) => PromotionProvider | null;
  /** Envoie le courriel d'échec ; une erreur ici ne change pas l'état. */
  notify: (email: FailureEmail) => Promise<void>;
  origin: string;
  now?: () => Date;
  warn?: (message: string) => void;
}

export interface PassSummary {
  orphaned: number;
  published: number;
  retrying: number;
  failed: number;
  cancelled: number;
  deferred: number;
  /** Laissées `SCHEDULED` faute d'éditeur. */
  waiting: number;
}

/** Publications déjà signalées sans éditeur : un avertissement par processus, pas par minute. */
const warnedWithoutProvider = new Set<string>();

function errorCode(kind: string, code: string | null): string {
  return code ? `${kind}:${code}` : kind;
}

export async function runPublisherPass(deps: PublisherDeps): Promise<PassSummary> {
  const { store } = deps;
  const clock = deps.now ?? (() => new Date());
  const warn = deps.warn ?? ((message: string) => console.warn(message));
  const now = clock();
  const summary: PassSummary = {
    orphaned: 0,
    published: 0,
    retrying: 0,
    failed: 0,
    cancelled: 0,
    deferred: 0,
    waiting: 0,
  };

  const log = (entry: PostLogEntry) => logPostAction(store.writeLog, entry);
  const notify = async (post: PostForPublish, reason: FailureReason) => {
    try {
      await deps.notify(buildFailureEmail(post, reason, { origin: deps.origin }));
    } catch (error) {
      console.error(
        `[promotion] courriel d'échec impossible (${post.id})`,
        error instanceof Error ? error.name : "erreur",
      );
    }
  };

  /** Issue définitive d'une publication réservée : FAILED ou CANCELLED, une seule fois. */
  const finish = async (
    post: PostForPublish,
    claimedAt: Date,
    status: "FAILED" | "CANCELLED",
    reason: FailureReason,
    entry: Omit<PostLogEntry, "postId">,
    attempts = post.attempts,
  ) => {
    const lastError = reasonText(reason, post.campaign.organizer.locale);
    const count = await store.updatePost(
      { id: post.id, status: "PUBLISHING", claimedAt },
      { status, lastError, attempts },
    );
    if (count !== 1) return;
    await log({ postId: post.id, ...entry });
    if (status === "FAILED") summary.failed += 1;
    else summary.cancelled += 1;
    await notify(post, reason);
  };

  // 1. Orphelines : on ne sait pas si la plateforme a publié. Pas de nouvelle
  //    tentative, qui risquerait un doublon : FAILED, à vérifier.
  for (const orphan of await store.listOrphans(new Date(now.getTime() - ORPHAN_AFTER_MS))) {
    const post = await store.loadPost(orphan.id);
    if (!post) continue;
    const reason: FailureReason = { code: "orphaned" };
    const count = await store.updatePost(
      { id: orphan.id, status: "PUBLISHING", claimedAt: orphan.claimedAt },
      { status: "FAILED", lastError: reasonText(reason, post.campaign.organizer.locale) },
    );
    if (count !== 1) continue;
    summary.orphaned += 1;
    await log({
      postId: orphan.id,
      action: "orphan",
      ok: false,
      errorCode: "ORPHANED",
      detail: "réservée depuis plus de 15 min sans issue : état inconnu, à vérifier chez la plateforme",
    });
    warn(`[promotion] publication ${orphan.id} restée en cours de publication : marquée à vérifier`);
    await notify(post, reason);
  }

  // 2. Publications dont l'heure est atteinte.
  for (const due of await store.listDue(now, BATCH_SIZE)) {
    const provider = deps.resolveProvider(due.account);
    if (!provider) {
      summary.waiting += 1;
      if (!warnedWithoutProvider.has(due.id)) {
        warnedWithoutProvider.add(due.id);
        warn(`[promotion] publication ${due.id} en attente : aucun éditeur disponible pour ce compte`);
      }
      continue;
    }

    // Limite de débit du compte, avant toute réservation.
    if (postsPerWindow(due.account.provider) !== null) {
      const recent = await store.recentPublishTimes(due.account.id, rateWindowStart(now));
      const rate = rateDecision(due.account.provider, recent, now);
      if (!rate.ok) {
        const count = await store.updatePost(
          { id: due.id, status: "SCHEDULED", scheduledAtLte: now },
          { scheduledAt: rate.retryAt },
        );
        if (count === 1) {
          summary.deferred += 1;
          await log({
            postId: due.id,
            action: "rate_limit",
            ok: false,
            errorCode: "RATE_LIMIT",
            detail: `${rate.count}/${rate.limit} publications sur 24 h pour ce compte : reportée au ${rate.retryAt.toISOString()}`,
          });
          warn(
            `[promotion] limite de ${rate.limit} publications / 24 h atteinte (compte ${due.account.id}) : ${due.id} reportée au ${rate.retryAt.toISOString()}`,
          );
        }
        continue;
      }
    }

    // Réservation atomique : une seule minuterie obtient count === 1.
    const claimedAt = now;
    const claimed = await store.updatePost(
      { id: due.id, status: "SCHEDULED", scheduledAtLte: now },
      { status: "PUBLISHING", claimedAt },
    );
    if (claimed !== 1) continue;
    await log({ postId: due.id, action: "claim", ok: true, detail: `réservée (éditeur ${provider.name})` });

    // Relue après la réservation : texte et événement tels qu'au moment de publier.
    const post = await store.loadPost(due.id);
    if (!post) continue;

    // Garde du § 2.5 : l'événement a pu être annulé, complet, passé ou fermé.
    const check = promotability(post.campaign.event, now);
    if (!check.promotable) {
      await finish(post, claimedAt, "CANCELLED", { code: "notPromotable", blockers: check.blockers }, {
        action: "cancel",
        ok: false,
        errorCode: "NOT_PROMOTABLE",
        detail: `événement plus promouvable : ${check.blockers.join(", ")}`,
      });
      continue;
    }

    if (post.account.status !== "ACTIVE") {
      await finish(post, claimedAt, "FAILED", { code: "accountInactive" }, {
        action: "fail",
        ok: false,
        errorCode: "ACCOUNT_INACTIVE",
        detail: `compte ${post.account.status} : à reconnecter`,
      });
      continue;
    }

    const attempts = post.attempts + 1;
    try {
      const result = await provider.publish(
        {
          id: post.id,
          message: post.message,
          imagePath: post.imagePath,
          linkUrl: post.linkUrl,
          attempts: post.attempts,
        },
        post.account,
      );
      // Le résultat est écrit même si la publication a entre-temps été marquée
      // orpheline : on sait désormais qu'elle est parue.
      const count = await store.updatePost(
        { id: post.id, status: ["PUBLISHING", "FAILED"], claimedAt },
        {
          status: "PUBLISHED",
          externalId: result.externalId,
          permalink: result.permalink,
          publishedAt: clock(),
          attempts,
          lastError: null,
        },
      );
      if (count === 1) summary.published += 1;
      await log({
        postId: post.id,
        action: "publish",
        ok: true,
        detail: `publiée (tentative ${attempts}, éditeur ${provider.name})`,
      });
      continue;
    } catch (error) {
      const known = error instanceof PromotionProviderError ? error : null;
      const kind = known?.kind ?? "UNEXPECTED";
      if (!known) {
        // Ni message ni pile : une erreur imprévue peut contenir une URL avec jeton.
        console.error(
          `[promotion] erreur imprévue de l'éditeur ${provider.name} (${post.id})`,
          error instanceof Error ? error.name : typeof error,
        );
      }
      const failure: Omit<PostLogEntry, "postId"> = {
        action: "publish",
        ok: false,
        httpStatus: known?.httpStatus ?? null,
        errorCode: errorCode(kind, known?.code ?? null),
      };

      if (kind === "TRANSIENT" && attempts < MAX_PUBLISH_ATTEMPTS) {
        const delay = RETRY_DELAYS_MS[attempts - 1]!;
        const retryAt = new Date(now.getTime() + delay);
        const reason: FailureReason = { code: "transient", attempts };
        const count = await store.updatePost(
          { id: post.id, status: "PUBLISHING", claimedAt },
          {
            status: "SCHEDULED",
            scheduledAt: retryAt,
            claimedAt: null,
            attempts,
            lastError: reasonText(reason, post.campaign.organizer.locale),
          },
        );
        if (count !== 1) continue;
        summary.retrying += 1;
        await log({ postId: post.id, ...failure, detail: `erreur transitoire (tentative ${attempts})` });
        await log({
          postId: post.id,
          action: "retry",
          ok: true,
          detail: `nouvelle tentative dans ${delay / MINUTE_MS} min (${retryAt.toISOString()})`,
        });
        continue;
      }

      if (kind === "TOKEN") {
        const reason: FailureReason = { code: "token" };
        await store.markAccountNeedsReconnect(
          post.account.id,
          reasonText(reason, post.campaign.organizer.locale),
        );
        await finish(post, claimedAt, "FAILED", reason, { ...failure, detail: "jeton refusé : compte à reconnecter" }, attempts);
        continue;
      }

      const reason: FailureReason =
        kind === "TRANSIENT"
          ? { code: "transient", attempts }
          : kind === "PERMANENT"
            ? { code: "permanent" }
            : { code: "unexpected" };
      await finish(
        post,
        claimedAt,
        "FAILED",
        reason,
        {
          ...failure,
          detail:
            kind === "TRANSIENT"
              ? `erreur transitoire (tentative ${attempts}) : abandon après ${MAX_PUBLISH_ATTEMPTS} tentatives`
              : kind === "PERMANENT"
                ? "refus définitif de la plateforme"
                : "erreur imprévue de l'éditeur",
        },
        attempts,
      );
    }
  }

  return summary;
}

// ─── Réessayer ─────────────────────────────────────────────────────────────

export type RetryError =
  /** Seule une publication FAILED se réessaie. */
  | "postLocked"
  /** Orpheline : elle a peut-être paru ; pas de réessai sans relire l'état chez la plateforme. */
  | "retryUnsafe";

/**
 * « Réessayer » depuis l'écran des publications : FAILED → SCHEDULED, à
 * l'instant, compteur de tentatives remis à zéro (un FAILED transitoire a
 * épuisé ses tentatives, le bouton ne servirait sinon jamais). La minuterie
 * reprend ensuite toutes ses gardes (promouvabilité, compte, débit).
 */
export async function retryFailedPost(
  store: Pick<PublisherStore, "updatePost" | "wasOrphaned" | "writeLog">,
  postId: string,
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; error: RetryError }> {
  if (await store.wasOrphaned(postId)) return { ok: false, error: "retryUnsafe" };
  const count = await store.updatePost(
    { id: postId, status: "FAILED" },
    { status: "SCHEDULED", scheduledAt: now, claimedAt: null, attempts: 0, lastError: null },
  );
  if (count !== 1) return { ok: false, error: "postLocked" };
  await logPostAction(store.writeLog, {
    postId,
    action: "retry",
    ok: true,
    detail: "réessai demandé depuis l'écran des publications",
  });
  return { ok: true };
}

// ─── Prisma ────────────────────────────────────────────────────────────────

function prismaWhere(where: PostWhere): Prisma.PromotionPostWhereInput {
  return {
    id: where.id,
    status: Array.isArray(where.status) ? { in: where.status } : where.status,
    ...(where.claimedAt !== undefined ? { claimedAt: where.claimedAt } : {}),
    ...(where.scheduledAtLte ? { scheduledAt: { lte: where.scheduledAtLte } } : {}),
  };
}

export function prismaPublisherStore(db: PrismaClient): PublisherStore {
  return {
    async listOrphans(claimedBefore) {
      const rows = await db.promotionPost.findMany({
        where: { status: "PUBLISHING", claimedAt: { lt: claimedBefore } },
        select: { id: true, claimedAt: true },
      });
      return rows.flatMap((r) => (r.claimedAt ? [{ id: r.id, claimedAt: r.claimedAt }] : []));
    },
    listDue(now, limit) {
      return db.promotionPost.findMany({
        where: { status: "SCHEDULED", scheduledAt: { lte: now } },
        orderBy: { scheduledAt: "asc" },
        take: limit,
        select: { id: true, account: { select: { id: true, provider: true, externalId: true } } },
      });
    },
    async updatePost(where, data) {
      const { count } = await db.promotionPost.updateMany({ where: prismaWhere(where), data });
      return count;
    },
    async loadPost(id) {
      const post = await db.promotionPost.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          message: true,
          imagePath: true,
          linkUrl: true,
          attempts: true,
          scheduledAt: true,
          claimedAt: true,
          account: {
            select: {
              id: true,
              provider: true,
              externalId: true,
              status: true,
              tokenEnc: true,
              viaAccountId: true,
              name: true,
            },
          },
          campaign: {
            select: {
              name: true,
              event: {
                select: {
                  title: true,
                  status: true,
                  visibility: true,
                  onlineSale: true,
                  sessions: { select: { startsAt: true, status: true } },
                },
              },
              organizer: {
                select: {
                  id: true,
                  name: true,
                  notifyEmails: true,
                  reportEmails: true,
                  user: { select: { locale: true } },
                },
              },
            },
          },
        },
      });
      if (!post) return null;
      const { user, ...organizer } = post.campaign.organizer;
      return {
        ...post,
        campaign: { ...post.campaign, organizer: { ...organizer, locale: user?.locale ?? null } },
      };
    },
    async recentPublishTimes(accountId, since) {
      const rows = await db.promotionPost.findMany({
        where: {
          accountId,
          OR: [
            { status: "PUBLISHED", publishedAt: { gt: since } },
            { status: "PUBLISHING", claimedAt: { gt: since } },
          ],
        },
        select: { status: true, publishedAt: true, claimedAt: true },
      });
      return rows.flatMap((r) => {
        const at = r.status === "PUBLISHED" ? r.publishedAt : r.claimedAt;
        return at ? [at] : [];
      });
    },
    async markAccountNeedsReconnect(accountId, lastError) {
      await db.organizerSocialAccount.updateMany({
        where: { id: accountId, status: "ACTIVE" },
        data: { status: "NEEDS_RECONNECT", lastError },
      });
    },
    async wasOrphaned(postId) {
      return (await db.promotionPostLog.count({ where: { postId, action: "orphan" } })) > 0;
    },
    async writeLog(row) {
      await db.promotionPostLog.create({ data: row });
    },
  };
}

// ─── Minuterie ─────────────────────────────────────────────────────────────

let started = false;
let running = false;

export function startPromotionPublisher(): void {
  if (started) return;
  started = true;
  const pass = async () => {
    if (running) return;
    running = true;
    try {
      // Imports à l'exécution : Prisma et l'envoi de courriels sont réservés
      // au serveur, la logique ci-dessus reste testable sans eux.
      const [{ prisma }, { sendPromotionFailureEmail }, { reportRecipients }, { publicAppOrigin }] =
        await Promise.all([
          import("@/lib/prisma"),
          import("@/lib/email"),
          import("@/lib/reports/report"),
          import("@/lib/app-url"),
        ]);
      const summary = await runPublisherPass({
        store: prismaPublisherStore(prisma),
        resolveProvider: (account) => resolveProvider(account),
        origin: publicAppOrigin(),
        notify: async (email) => {
          const [to, ...bcc] = reportRecipients(email.organizer);
          if (!to) return;
          await sendPromotionFailureEmail({ ...email, to, bcc });
        },
      });
      const done = summary.published + summary.failed + summary.cancelled + summary.orphaned + summary.retrying;
      if (done > 0) {
        console.log(
          `[promotion] ${summary.published} publiée(s), ${summary.retrying} à réessayer, ${summary.failed} en échec, ${summary.cancelled} annulée(s), ${summary.orphaned} à vérifier`,
        );
      }
    } catch (error) {
      console.error("[promotion] minuterie", error);
    } finally {
      running = false;
    }
  };
  setInterval(() => void pass(), PUBLISH_INTERVAL_MS).unref();
}
