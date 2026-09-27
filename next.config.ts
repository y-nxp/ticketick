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
// JSON-LD), mais aucune origine tierce ne peut fournir de script, et les
// cadres, connexions, formulaires et plugins sont bornés.
// 'wasm-unsafe-eval' : décodeurs d'images de pdf.js (import de plans).
function csp(frameAncestors: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://images.unsplash.com",
    "font-src 'self' data:",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "frame-src 'self' https://www.openstreetmap.org",
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
