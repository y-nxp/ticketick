"use server";

import { revalidatePath } from "next/cache";
import { catalogActor, forbidIfForeignEvent } from "@/lib/admin/access";
import { publicAppOrigin } from "@/lib/app-url";
import { prisma } from "@/lib/prisma";
import { mayWritePromotion } from "@/lib/promotion/access";
import { CAMPAIGN_CODE_LENGTH, freeCampaignCode } from "@/lib/promotion/campaign-code";
import { campaignLink, channelOf, type PromotionChannel } from "@/lib/promotion/channels";
import { checkComposition } from "@/lib/promotion/compose";
import { freezePromotionImage, ImageCopyError } from "@/lib/promotion/image-copy";
import { editablePostWhere, isPostIntent, planCancel, planPostStatus } from "@/lib/promotion/post-status";
import { messageLimit } from "@/lib/promotion/preview";
import { promotability } from "@/lib/promotion/promotable";
import { prismaPublisherStore, retryFailedPost } from "@/lib/promotion/publisher";
import { promotionMessage, type PromotionLocale } from "@/lib/promotion/template";
import { readUploadFile, saveUploadedImage, UploadError } from "@/lib/uploads";
import {
  failure,
  readOptionalDateTime,
  readOptionalText,
  readText,
  success,
  type FormState,
} from "./form";

/**
 * Compositeur de publications (docs/module-promotion.md, §§ 2.4 et 2.5).
 *
 * Droits du § 2.1 pour tous les rôles, même si l'interface n'est encore
 * affichée qu'à l'admin (`canSeePromotionUi`) : `catalogActor()` écarte le
 * responsable invité et les autres rôles, `forbidIfForeignEvent` l'événement
 * d'un autre organisateur, `mayWritePromotion` et les contrôles de
 * `checkComposition` le compte social ou la publication qui ne relèvent pas
 * du même organisateur que l'événement.
 *
 * Rien ne part chez Facebook ni Instagram ici : « Publier maintenant »
 * programme à l'instant, la minuterie (carte 4/5) publie.
 */

function refresh(eventId: string) {
  revalidatePath("/admin/promotion");
  revalidatePath(`/admin/events/${eventId}`);
}

/** Date facultative : vide → `null` ; illisible → `undefined` (erreur). */
function readSchedule(data: FormData): Date | null | undefined {
  const value = readOptionalDateTime(data, "scheduledAt");
  if (value === undefined) return null;
  return value ?? undefined;
}

export async function createPromotion(_state: FormState, data: FormData): Promise<FormState> {
  const { user, organizerId: scoped } = await catalogActor();

  const eventId = readText(data, "eventId");
  if (!eventId) return failure("notFound");
  await forbidIfForeignEvent(eventId, scoped);

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      organizerId: true,
      status: true,
      visibility: true,
      onlineSale: true,
      coverImage: true,
      gallery: true,
      sessions: { select: { id: true, startsAt: true, status: true } },
    },
  });
  if (!event) return failure("notFound");
  if (!mayWritePromotion(user, event.organizerId)) return failure("forbidden");

  const intent = readText(data, "intent");
  if (!isPostIntent(intent)) return failure("intentInvalid");
  const scheduledAt = readSchedule(data);
  if (scheduledAt === undefined) return failure("scheduleInvalid");

  const accountIds = data.getAll("accountId").filter((v): v is string => typeof v === "string");
  const accounts = await prisma.organizerSocialAccount.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, organizerId: true, provider: true, status: true },
  });

  const body = readText(data, "body");
  const locale = readText(data, "locale");
  const origin = publicAppOrigin();
  const messageFor = (channel: PromotionChannel, code: string) =>
    promotionMessage({
      body,
      channel,
      link: campaignLink(origin, code, channel),
      locale: locale as PromotionLocale,
      onlineSale: event.onlineSale,
    });

  const plan = checkComposition(
    event,
    accounts,
    {
      sessionId: readOptionalText(data, "sessionId") ?? null,
      locale,
      landing: readText(data, "landing") || "go",
      name: readText(data, "name"),
      accountIds,
      image: readOptionalText(data, "image") ?? null,
      body,
      intent,
      scheduledAt,
    },
    // Longueur vérifiée avec un code de la taille du vrai, tiré ensuite.
    (channel) => messageFor(channel, "x".repeat(CAMPAIGN_CODE_LENGTH)),
  );
  if (!plan.ok) return failure(plan.error);

  let imagePath: string | null = null;
  if (plan.image) {
    try {
      imagePath = await freezePromotionImage(
        { read: readUploadFile, save: saveUploadedImage },
        plan.image,
        event.organizerId,
      );
    } catch (error) {
      if (error instanceof ImageCopyError || error instanceof UploadError) return failure(error.key);
      console.error("[promotion] copie du visuel", error);
      return failure("unavailable");
    }
  }

  try {
    const code = await freeCampaignCode(prisma);
    const campaign = await prisma.promotionCampaign.create({
      data: {
        organizerId: event.organizerId,
        eventId,
        sessionId: plan.sessionId,
        code,
        name: plan.name,
        locale: plan.locale,
        landing: plan.landing,
        createdById: user.id,
        posts: {
          create: plan.posts.map(({ accountId, channel }) => ({
            accountId,
            status: plan.status,
            scheduledAt: plan.scheduledAt,
            message: messageFor(channel, code),
            imagePath,
            linkUrl: campaignLink(origin, code, channel),
            createdById: user.id,
          })),
        },
      },
      select: { id: true },
    });
    refresh(eventId);
    return success(campaign.id);
  } catch (error) {
    console.error("[promotion] création de la campagne", error);
    return failure("unavailable");
  }
}

/** Publication de l'acteur, avec ce qu'il faut pour revérifier les règles. */
async function writablePost(id: string) {
  const { user, organizerId: scoped } = await catalogActor();
  const post = await prisma.promotionPost.findUnique({
    where: { id },
    select: {
      status: true,
      claimedAt: true,
      account: { select: { provider: true, organizerId: true, status: true } },
      campaign: {
        select: {
          organizerId: true,
          eventId: true,
          event: {
            select: {
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
  if (!post) return null;
  await forbidIfForeignEvent(post.campaign.eventId, scoped);
  if (
    !mayWritePromotion(user, post.campaign.organizerId) ||
    post.account.organizerId !== post.campaign.organizerId
  ) {
    return null;
  }
  return post;
}

export async function updatePromotionPost(_state: FormState, data: FormData): Promise<FormState> {
  const id = readText(data, "id");
  const post = id ? await writablePost(id) : null;
  if (!post) return failure("notFound");
  const channel = channelOf(post.account.provider);
  if (!channel) return failure("notFound");

  const message = readText(data, "message");
  if (!message) return failure("messageRequired");
  if (message.length > messageLimit(channel)) return failure("messageTooLong");

  const intent = readText(data, "intent");
  if (!isPostIntent(intent)) return failure("intentInvalid");
  const scheduledAt = readSchedule(data);
  if (scheduledAt === undefined) return failure("scheduleInvalid");

  const plan = planPostStatus({
    intent,
    scheduledAt,
    promotable: promotability(post.campaign.event).promotable,
    now: new Date(),
    current: post,
  });
  if (!plan.ok) return failure(plan.error);

  // Conditionnel : si la minuterie a réservé la publication entre la lecture
  // et l'écriture, rien n'est écrit.
  const { count } = await prisma.promotionPost.updateMany({
    where: editablePostWhere(id),
    data: { message, status: plan.status, scheduledAt: plan.scheduledAt },
  });
  if (count !== 1) return failure("postLocked");
  refresh(post.campaign.eventId);
  revalidatePath(`/admin/promotion/publications/${id}`);
  return success(id);
}

export async function cancelPromotionPost(_state: FormState, data: FormData): Promise<FormState> {
  const id = readText(data, "id");
  const post = id ? await writablePost(id) : null;
  if (!post) return failure("notFound");

  const plan = planCancel(post);
  if (!plan.ok) return failure(plan.error);

  const { count } = await prisma.promotionPost.updateMany({
    where: editablePostWhere(id),
    data: { status: "CANCELLED" },
  });
  if (count !== 1) return failure("postLocked");
  refresh(post.campaign.eventId);
  revalidatePath(`/admin/promotion/publications/${id}`);
  return success(id);
}

/**
 * « Réessayer » une publication en échec (§ 2.5) : retour en SCHEDULED à
 * l'instant, la minuterie la reprend avec toutes ses gardes. Prête à brancher
 * sur l'écran des publications ; refusée pour une publication orpheline, qui
 * a peut-être paru (`retryFailedPost`).
 */
export async function retryPromotionPost(_state: FormState, data: FormData): Promise<FormState> {
  const id = readText(data, "id");
  const post = id ? await writablePost(id) : null;
  if (!post) return failure("notFound");
  if (post.status !== "FAILED") return failure("postLocked");
  if (!promotability(post.campaign.event).promotable) return failure("notPromotable");
  if (post.account.status !== "ACTIVE") return failure("accountInvalid");

  const result = await retryFailedPost(prismaPublisherStore(prisma), id);
  if (!result.ok) return failure(result.error);
  refresh(post.campaign.eventId);
  revalidatePath(`/admin/promotion/publications/${id}`);
  return success(id);
}
