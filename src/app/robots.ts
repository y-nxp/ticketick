import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { publicAppOrigin } from "@/lib/app-url";

const privatePaths = [
  "/admin",
  "/account",
  "/cart",
  "/checkout",
  "/door",
  "/embed",
  "/forbidden",
  "/forgot-password",
  "/login",
  "/organizer/dashboard",
  "/pay",
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
      allow: "/",
      disallow: [
        "/api/",
        ...prefixes.flatMap((p) => privatePaths.map((path) => `${p}${path}`)),
      ],
    },
    sitemap: `${publicAppOrigin()}/sitemap.xml`,
  };
}
