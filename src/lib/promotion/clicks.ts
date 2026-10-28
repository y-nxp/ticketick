import "server-only";

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { AttributionCampaign } from "./attribution";
import { parsePromotionCookie, PROMOTION_COOKIE, type PromotionClick } from "./cookie";
import { clickDay } from "./landing";
import type { PromotionSource } from "./source";

/**
 * Un clic de plus pour la campagne, ce jour-là (à Zurich), depuis cette
 * source. Agrégé : ni adresse IP ni identifiant (§ 5.5). Une seule
 * instruction, la base fait l'incrément : deux clics simultanés comptent
 * bien pour deux, y compris le premier du jour.
 */
export async function countCampaignClick(
  campaignId: string,
  source: PromotionSource,
  at: Date = new Date(),
): Promise<void> {
  const day = clickDay(at);
  await prisma.$executeRaw`
    INSERT INTO "PromotionClickDay" ("campaignId", "day", "source", "clicks")
    VALUES (${campaignId}, ${day}::date, ${source}, 1)
    ON CONFLICT ("campaignId", "day", "source")
    DO UPDATE SET "clicks" = "PromotionClickDay"."clicks" + 1
  `;
}

/** Campagne d'un code lu dans `tt_cmp`, pour `resolveOrderAttribution`. */
export function findAttributionCampaign(code: string): Promise<AttributionCampaign | null> {
  return prisma.promotionCampaign.findUnique({
    where: { code },
    select: { id: true, organizerId: true },
  });
}

/**
 * Dernier clic de campagne de ce navigateur, lu dans les routes de commande
 * (`/api/hold`, `/api/checkout`). Absent, bloqué ou illisible : `undefined`,
 * la commande se crée normalement, sans attribution.
 */
export async function readPromotionClick(): Promise<PromotionClick | undefined> {
  try {
    const store = await cookies();
    return parsePromotionCookie(store.get(PROMOTION_COOKIE)?.value) ?? undefined;
  } catch {
    return undefined;
  }
}
