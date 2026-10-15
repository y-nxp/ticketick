import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Le widget billetterie est posé en iframe sur les sites des organisateurs ;
// partout ailleurs, l'intégration dans une page tierce ouvrirait la porte au
// détournement de clic (bouton « Payer » sous un calque invisible).
const framable = ["/embed/:path*", "/:locale/embed/:path*", "/go/:path*", "/:locale/go/:path*"];

const isDev = process.env.NODE_ENV === "development";

// Sans nonce : un nonce imposerait le rendu dynamique de toutes les pages.
// Les scripts en ligne restent donc permis (amorce de Next.js, thème,
// JSON-LD), et seuls Google (gtag), Meta (pixel) et Matomo peuvent fournir un
// script tiers ; les cadres, connexions, formulaires et plugins sont bornés.
// Ces origines restent autorisées même sans identifiant de mesure : la CSP
// est figée au build, les identifiants sont lus au démarrage.
// 'wasm-unsafe-eval' : décodeurs d'images de pdf.js (import de plans).
const matomoOrigin = "https://stats.nextalp.com";
const analyticsScripts = `https://www.googletagmanager.com https://connect.facebook.net ${matomoOrigin}`;
const analyticsConnect = `https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.g.doubleclick.net https://www.google.com https://www.facebook.com https://connect.facebook.net ${matomoOrigin}`;
const analyticsImages = `https://*.google-analytics.com https://*.googletagmanager.com https://*.g.doubleclick.net https://www.google.com https://www.google.ch https://www.facebook.com ${matomoOrigin}`;

function csp(frameAncestors: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' ${analyticsScripts}${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https://images.unsplash.com ${analyticsImages}`,
    "font-src 'self' data:",
    `connect-src 'self' ${analyticsConnect}${isDev ? " ws: wss:" : ""}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "frame-src 'self' https://www.openstreetmap.org https://td.doubleclick.net https://www.googletagmanager.com",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "**.ticketick.ch" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), payment=(self)",
          },
          { key: "Content-Security-Policy", value: csp("'self'") },
        ],
      },
      ...framable.map((source) => ({
        source,
        headers: [{ key: "Content-Security-Policy", value: csp("*") }],
      })),
    ];
  },
};

export default withNextIntl(nextConfig);
