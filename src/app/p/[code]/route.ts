import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeCampaignCode } from "@/lib/promotion/campaign-code";
import { countCampaignClick } from "@/lib/promotion/clicks";
import {
  PROMOTION_COOKIE,
  PROMOTION_COOKIE_OPTIONS,
  serializePromotionCookie,
} from "@/lib/promotion/cookie";
import { landingPath } from "@/lib/promotion/landing";
import { isBotUserAgent } from "@/lib/promotion/robots";
import { postIdFromLinkParam, sourceFromLinkParam } from "@/lib/promotion/source";

/**
 * Lien de campagne `/p/{code}?s=fb&p={publication}` (docs/module-promotion.md,
 * § 5.1) : compte le clic, pose `tt_cmp`, puis redirige (302) vers la page de
 * l'événement avec les UTM.
 *
 * Hors de `[locale]` : le lien publié n'a pas de préfixe de langue, celle de
 * la campagne s'applique à la page d'arrivée. Le proxy laisse passer `/p/`
 * sans next-intl et renvoie déjà vers l'accueil un code mal formé.
 *
 * Code inconnu : accueil, sans erreur, ni clic ni cookie. Les robots d'aperçu
 * reçoivent la même redirection, sans être comptés ni marqués.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const code = normalizeCampaignCode((await params).code);
  const campaign = code
    ? await prisma.promotionCampaign
        .findUnique({
          where: { code },
          select: {
            id: true,
            code: true,
            locale: true,
            landing: true,
            event: {
              select: {
                slug: true,
                visibility: true,
                organizer: { select: { slug: true } },
              },
            },
          },
        })
        .catch((error) => {
          console.error("[promotion] lecture de la campagne", error);
          return null;
        })
    : null;
  if (!campaign) return redirect("/");

  const query = new URL(request.url).searchParams;
  const source = sourceFromLinkParam(query.get("s"));
  const response = redirect(
    landingPath(campaign, { source, postId: postIdFromLinkParam(query.get("p")) }),
  );

  if (isBotUserAgent(request.headers.get("user-agent"))) return response;

  const now = new Date();
  // Le compteur ne doit jamais coûter la redirection au visiteur.
  await countCampaignClick(campaign.id, source, now).catch((error) => {
    console.error("[promotion] comptage du clic", campaign.id, error);
  });
  // Dernier clic gagne : un nouveau clic remplace le précédent, horodatage compris.
  response.cookies.set(
    PROMOTION_COOKIE,
    serializePromotionCookie({ code: campaign.code, source, clickAt: now }),
    PROMOTION_COOKIE_OPTIONS,
  );
  return response;
}

/**
 * 302 vers un chemin relatif : derrière le reverse proxy, `request.url` vaut
 * l'adresse interne du conteneur. Jamais mis en cache, sinon les clics
 * suivants ne passeraient plus par ici.
 */
function redirect(path: string): NextResponse {
  return new NextResponse(null, {
    status: 302,
    headers: { location: path, "cache-control": "no-store" },
  });
}
