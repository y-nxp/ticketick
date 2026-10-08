import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
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

export default function proxy(request: NextRequest) {
  if (hostedPath.test(request.nextUrl.pathname)) {
    return withShopOriginCookie(request, hostedLocale(request));
  }

  return withShopOriginCookie(request, detectLocale(request));
}

export const config = {
  matcher: [
    // Toutes les routes sauf les fichiers statiques, l'API et _next
    "/((?!api|_next|_vercel|.*\\..*).*)",
  ],
};
