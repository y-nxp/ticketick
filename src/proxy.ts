import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { legacyRedirect, internalPath, middlewarePathnames } from "./i18n/pathnames";
import { routing } from "./i18n/routing";
import { agentHitFor, sendAgentHit } from "./lib/analytics/agent-tracking";
import { pageAction } from "./lib/analytics/agents";
import {
  PROMOTION_COOKIE,
  PROMOTION_COOKIE_OPTIONS,
  serializePromotionCookie,
} from "./lib/promotion/cookie";
import { campaignLink, landingClick } from "./lib/promotion/proxy-rules";
import { parseGoOrigin, SHOP_ORIGIN_COOKIE } from "./lib/shop-origin";

// Adresses traduites (src/i18n/pathnames.ts) : next-intl réécrit `/tarifs`
// vers la page interne `/fr/pricing`. La navigation garde `routing` sans
// `pathnames`, pour que les liens restent de simples chaînes.
const localizedRouting = { ...routing, pathnames: middlewarePathnames(routing.locales) };

const detectLocale = createMiddleware(localizedRouting);

/**
 * Pages destinées au site du client : le lien partagé s'ouvre en français
 * quelle que soit la langue du navigateur, puis le visiteur peut en changer.
 * Les liens de paiement et de changement de places portent déjà la langue
 * de la commande.
 */
const hostedLocale = createMiddleware({
  ...localizedRouting,
  localeDetection: false,
});

/**
 * Article du blog (`/blog/slug`, `/de/blog/slug`) : il n'existe que dans sa
 * langue et la page renvoie toute autre langue vers son adresse. Détecter la
 * langue du navigateur ici (`/blog/x` → `/de/blog/x` → `/blog/x`…) tournerait
 * en rond ; et ses variantes linguistiques ne sont pas celles de next-intl.
 * Lire un article français ne change pas non plus la langue retenue du visiteur.
 */
const articleLocale = createMiddleware({
  ...localizedRouting,
  localeDetection: false,
  alternateLinks: false,
  localeCookie: false,
});

const prefixes = routing.locales
  .filter((l) => l !== routing.defaultLocale)
  .join("|");
const localePrefix = new RegExp(`^/(?:${prefixes})(?=/|$)`);
const hostedPath = new RegExp(`^(?:/(?:${prefixes}))?/(?:go|embed|pay|change)(?:/|$)`);
const articlePagePath = new RegExp(`^(?:/(?:${prefixes}))?/blog/[^/]+/?$`);

function withShopOriginCookie(
  request: NextRequest,
  response: NextResponse,
): NextResponse {
  const path = request.nextUrl.pathname.replace(localePrefix, "") || "/";
  const origin = parseGoOrigin(path);
  if (origin) {
    response.cookies.set(SHOP_ORIGIN_COOKIE, origin.path, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 12,
    });
  }
  return response;
}

/**
 * Lien de campagne copié sans passer par `/p/` (`/go/…?utm_campaign=tt-…`) :
 * mémorise le clic comme le ferait `/p/{code}` (docs/module-promotion.md,
 * § 5.1). Format seul, sans base : un code inconnu est ignoré à la commande.
 */
function withCampaignCookie(
  request: NextRequest,
  response: NextResponse,
): NextResponse {
  const click = landingClick({
    pathname: internalPath(request.nextUrl.pathname.replace(localePrefix, "") || "/"),
    searchParams: request.nextUrl.searchParams,
    currentCookie: request.cookies.get(PROMOTION_COOKIE)?.value,
    userAgent: request.headers.get("user-agent"),
    now: new Date(),
  });
  if (click) {
    response.cookies.set(
      PROMOTION_COOKIE,
      serializePromotionCookie(click),
      PROMOTION_COOKIE_OPTIONS,
    );
  }
  return response;
}

/**
 * Page demandée par un robot ou un agent IA : envoyée au site Matomo des
 * agents après la réponse. Pour un humain, rien ne part.
 */
function trackAgentPage(request: NextRequest, event: NextFetchEvent) {
  if (request.method !== "GET") return;
  const { pathname } = request.nextUrl;
  let detail = pathname;
  try {
    detail = decodeURIComponent(pathname);
  } catch {
    // Adresse mal encodée : gardée telle quelle.
  }
  const hit = agentHitFor(request, pageAction(pathname), detail, false);
  if (hit) event.waitUntil(sendAgentHit(hit));
}

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  trackAgentPage(request, event);

  // `/p/{code}` répond sans préfixe de langue (route hors de `[locale]`) :
  // next-intl le réécrirait en `/fr/p/…`, introuvable. Un code mal formé
  // repart vers l'accueil sans atteindre la base.
  const link = campaignLink(request.nextUrl.pathname);
  if (link) {
    if (link.code) return NextResponse.next();
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    const response = NextResponse.redirect(home, 302);
    response.headers.set("cache-control", "no-store");
    return response;
  }

  // Ancienne adresse en anglais (`/pricing`, `/de/events/…`) : vers celle de
  // la langue. Permanente (308), sauf les concerts de Gstaad (302) pendant le
  // festival.
  const moved = legacyRedirect(request.nextUrl.pathname, routing.locales, routing.defaultLocale);
  if (moved) {
    const target = request.nextUrl.clone();
    target.pathname = moved.pathname;
    return NextResponse.redirect(target, moved.status);
  }

  if (hostedPath.test(request.nextUrl.pathname)) {
    return withCampaignCookie(
      request,
      withShopOriginCookie(request, hostedLocale(request)),
    );
  }

  if (articlePagePath.test(request.nextUrl.pathname)) {
    return withCampaignCookie(request, articleLocale(request));
  }

  return withCampaignCookie(
    request,
    withShopOriginCookie(request, detectLocale(request)),
  );
}

export const config = {
  matcher: [
    // Toutes les routes sauf les fichiers statiques, l'API et _next
    "/((?!api|_next|_vercel|.*\\..*).*)",
  ],
};
