import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { publicAppOrigin } from "@/lib/app-url";

const privatePaths = [
  "/admin",
  "/account",
  "/cart",
  "/change",
  "/checkout",
  "/door",
  "/embed",
  "/forbidden",
  "/forgot-password",
  "/login",
  "/organizer/dashboard",
  "/pay",
  "/pos",
  "/register",
  "/reset-password",
  "/verify-email",
];

export default function robots(): MetadataRoute.Robots {
  const prefixes = [
    "",
    ...routing.locales
      .filter((l) => l !== routing.defaultLocale)
      .map((l) => `/${l}`),
  ];
  return {
    rules: {
      userAgent: "*",
      // L'API publique et ses descriptions sont faites pour être lues par
      // les moteurs et les agents IA ; le reste de `/api/` ne l'est pas.
      allow: ["/", "/api/v1/public/", "/api/v1/openapi.json", "/llms.txt", "/llms-full.txt", "/openapi.json"],
      disallow: [
        "/api/",
        ...prefixes.flatMap((p) => privatePaths.map((path) => `${p}${path}`)),
      ],
    },
    sitemap: `${publicAppOrigin()}/sitemap.xml`,
  };
}
