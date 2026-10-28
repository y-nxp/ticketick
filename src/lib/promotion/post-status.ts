import type { PromotionPostStatus } from "@prisma/client";

/**
 * Cycle de vie d'une publication côté compositeur (docs/module-promotion.md,
 * §§ 2.5 et 3.4) : DRAFT ⇄ SCHEDULED, puis CANCELLED. La suite (PUBLISHING,
 * PUBLISHED, FAILED) appartient à la minuterie (carte 4/5).
 *
 * Une publication se modifie ou s'annule tant que la minuterie ne l'a pas
 * prise en charge : statut DRAFT ou SCHEDULED, et `claimedAt` vide. Le serveur
 * écrit avec `editablePostWhere`, condition reprise dans le `updateMany` :
 * une réservation concurrente de la minuterie gagne, la modification échoue
 * au lieu de l'écraser.
 */

export const EDITABLE_POST_STATUSES = ["DRAFT", "SCHEDULED"] as const satisfies readonly PromotionPostStatus[];

/**
 * Ce que demande l'organisateur :
 * - `draft` : enregistrer sans programmer (ou retirer du programme) ;
 * - `schedule` : programmer à la date choisie, fuseau Zurich ;
 * - `now` : publier maintenant, c'est-à-dire programmer à l'instant ; la
 *   minuterie le publie à son prochain passage.
 */
export const POST_INTENTS = ["draft", "schedule", "now"] as const;
export type PostIntent = (typeof POST_INTENTS)[number];

export function isPostIntent(value: string): value is PostIntent {
  return (POST_INTENTS as readonly string[]).includes(value);
}

export interface PostState {
  status: PromotionPostStatus;
  claimedAt: Date | null;
}

export function isPostEditable(post: PostState): boolean {
  return (EDITABLE_POST_STATUSES as readonly string[]).includes(post.status) && post.claimedAt === null;
}

/** Condition d'écriture : la publication n'a pas changé de main entre-temps. */
export function editablePostWhere(id: string) {
  return {
    id,
    status: { in: [...EDITABLE_POST_STATUSES] },
    claimedAt: null,
  };
}

/**
 * Délai minimal d'une programmation : une date « dans une minute » saisie à
 * la main serait déjà passée à l'arrivée du formulaire.
 */
export const MIN_SCHEDULE_LEAD_MS = 60 * 1000;

export type PostStatusError =
  /** Événement plus promouvable : on prépare, on ne programme pas (§ 2.2). */
  | "notPromotable"
  | "scheduleRequired"
  | "scheduleInPast"
  /** Prise en charge par la minuterie, publiée ou annulée. */
  | "postLocked";

export type PostStatusPlan =
  | { ok: true; status: "DRAFT" | "SCHEDULED"; scheduledAt: Date | null }
  | { ok: false; error: PostStatusError };

export interface PostStatusRequest {
  intent: PostIntent;
  /** Date saisie (Zurich, déjà convertie) ; `null` : absente ou illisible. */
  scheduledAt: Date | null;
  promotable: boolean;
  now: Date;
  /** Publication existante ; absente à la création. */
  current?: PostState;
}

/** Statut et date à écrire, ou la raison du refus. */
export function planPostStatus(request: PostStatusRequest): PostStatusPlan {
  if (request.current && !isPostEditable(request.current)) return { ok: false, error: "postLocked" };

  switch (request.intent) {
    case "draft":
      // La date proposée se garde : la minuterie ne lit que les SCHEDULED.
      return { ok: true, status: "DRAFT", scheduledAt: request.scheduledAt };
    case "now":
      if (!request.promotable) return { ok: false, error: "notPromotable" };
      return { ok: true, status: "SCHEDULED", scheduledAt: request.now };
    case "schedule":
      if (!request.promotable) return { ok: false, error: "notPromotable" };
      if (!request.scheduledAt) return { ok: false, error: "scheduleRequired" };
      if (request.scheduledAt.getTime() < request.now.getTime() + MIN_SCHEDULE_LEAD_MS) {
        return { ok: false, error: "scheduleInPast" };
      }
      return { ok: true, status: "SCHEDULED", scheduledAt: request.scheduledAt };
  }
}

/** Annulation : seulement avant la prise en charge. */
export function planCancel(current: PostState): { ok: true } | { ok: false; error: "postLocked" } {
  return isPostEditable(current) ? { ok: true } : { ok: false, error: "postLocked" };
}
