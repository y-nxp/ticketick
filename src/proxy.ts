import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import {
  PROMOTION_COOKIE,
  PROMOTION_COOKIE_OPTIONS,
  serializePromotionCookie,
} from "./lib/promotion/cookie";
import { campaignLink, landingClick } from "./lib/promotion/proxy-rules";
import { parseGoOrigin, SHOP_ORIGIN_COOKIE } from "./lib/shop-origin";

const detectLocale = createMiddleware(routing);

/**
 * Pages destinées au site du client : le lien partagé s'ouvre en français
 * quelle que soit la langue du navigateur, puis le visiteur peut en changer.
 * Les liens de paiement et de changement de places portent déjà la langue
 * de la commande.
 */
const hostedLocale = createMiddleware({
  ...routing,
  localeDetection: false,
});

const prefixes = routing.locales
  .filter((l) => l !== routing.defaultLocale)
  .join("|");
const localePrefix = new RegExp(`^/(?:${prefixes})(?=/|$)`);
const hostedPath = new RegExp(`^(?:/(?:${prefixes}))?/(?:go|embed|pay|change)(?:/|$)`);

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
    pathname: request.nextUrl.pathname.replace(localePrefix, "") || "/",
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

export default function proxy(request: NextRequest) {
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

  if (hostedPath.test(request.nextUrl.pathname)) {
    return withCampaignCookie(
      request,
      withShopOriginCookie(request, hostedLocale(request)),
    );
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
