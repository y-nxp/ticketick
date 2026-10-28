import type { EventStatus, EventVisibility } from "@prisma/client";

/**
 * Un événement peut-il être promu sur les réseaux (docs/module-promotion.md,
 * § 2.2) ? Partagé par le bouton « Promouvoir », le compositeur et la
 * minuterie, qui revérifie au moment de publier (§ 2.5).
 *
 * Règles :
 * - événement publié (`PUBLISHED`) ;
 * - au moins une séance à venir encore en vente ;
 * - visibilité `PUBLIC` ou `UNLISTED`, jamais `MEMBERS` (communauté fermée) ;
 * - `onlineSale = false` reste promouvable : le lien mène à la fiche
 *   (contact) et l'attribution des ventes est sans objet.
 *
 * Un brouillon se prépare mais ne se programme pas (`preparable`).
 */

export type PromotionBlocker =
  /** Brouillon : à publier avant de programmer. */
  | "draft"
  | "cancelled"
  | "soldOut"
  /** Événement terminé, ou plus aucune séance à venir. */
  | "past"
  /** Réservé à une communauté : jamais sur les réseaux. */
  | "members"
  /** Aucune séance datée. */
  | "noSession"
  /** Des séances à venir, toutes complètes. */
  | "sessionsSoldOut";

export interface PromotableSession {
  startsAt: Date | string;
  status: EventStatus;
}

export interface PromotableEvent {
  status: EventStatus;
  visibility: EventVisibility;
  onlineSale: boolean;
  sessions: PromotableSession[];
}

export interface Promotability {
  /** Publier ou programmer est permis. */
  promotable: boolean;
  /** Préparer une publication est permis (brouillon compris). */
  preparable: boolean;
  /** Raisons du refus, vides si `promotable`. */
  blockers: PromotionBlocker[];
  /** Ventes en ligne : la campagne pourra être reliée à des commandes. */
  attribution: boolean;
}

const EVENT_BLOCKERS: Partial<Record<EventStatus, PromotionBlocker>> = {
  DRAFT: "draft",
  CANCELLED: "cancelled",
  SOLD_OUT: "soldOut",
  PAST: "past",
};

export function promotability(event: PromotableEvent, now: Date = new Date()): Promotability {
  const blockers: PromotionBlocker[] = [];

  const statusBlocker = EVENT_BLOCKERS[event.status];
  if (statusBlocker) blockers.push(statusBlocker);
  if (event.visibility === "MEMBERS") blockers.push("members");

  // Séances à venir, hors annulées et brouillons ; une séance passée par
  // erreur encore marquée PUBLISHED compte comme passée.
  const upcoming = event.sessions.filter(
    (s) =>
      new Date(s.startsAt).getTime() > now.getTime() &&
      (s.status === "PUBLISHED" || s.status === "SOLD_OUT"),
  );
  if (event.sessions.length === 0) blockers.push("noSession");
  else if (upcoming.length === 0) {
    if (!blockers.includes("past")) blockers.push("past");
  } else if (upcoming.every((s) => s.status === "SOLD_OUT")) {
    if (!blockers.includes("soldOut")) blockers.push("sessionsSoldOut");
  }

  const promotable = blockers.length === 0;
  return {
    promotable,
    preparable:
      promotable ||
      (event.status === "DRAFT" && blockers.every((b) => b === "draft" || b === "noSession")),
    blockers,
    attribution: event.onlineSale,
  };
}
