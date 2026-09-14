import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { parseGoOrigin, SHOP_ORIGIN_COOKIE } from "./lib/shop-origin";

const detectLocale = createMiddleware(routing);

/** Pages destinées au site du client : pas de bascule selon le navigateur. */
const hostedLocale = createMiddleware({
  ...routing,
  localeDetection: false,
});

const hostedPath =
  /^(?:\/(?:en|de|it))?\/(?:go|embed)(?:\/|$)/;

function withShopOriginCookie(
  request: NextRequest,
  response: NextResponse,
): NextResponse {
  const path =
    request.nextUrl.pathname.replace(/^\/(?:en|de|it)(?=\/|$)/, "") || "/";
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
  const { pathname } = request.nextUrl;

  if (hostedPath.test(pathname)) {
    const french = pathname.replace(/^\/(?:en|de|it)(?=\/|$)/, "") || "/";
    if (french !== pathname) {
      const url = request.nextUrl.clone();
      url.pathname = french;
      return NextResponse.redirect(url);
    }
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
