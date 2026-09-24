import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Le widget billetterie est posé en iframe sur les sites des organisateurs ;
// partout ailleurs, l'intégration dans une page tierce ouvrirait la porte au
// détournement de clic (bouton « Payer » sous un calque invisible).
const framable = ["/embed/:path*", "/:locale/embed/:path*", "/go/:path*", "/:locale/go/:path*"];

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
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
      ...framable.map((source) => ({
        source,
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      })),
    ];
  },
};

export default withNextIntl(nextConfig);
