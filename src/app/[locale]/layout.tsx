import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Inter, Jost } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import "../globals.css";
import { routing } from "@/i18n/routing";
import { CartProvider } from "@/components/cart/cart-context";
import { AppShell } from "@/components/layout/app-shell";
import {
  AccountNav,
  AccountNavFallback,
} from "@/components/layout/account-nav";
import { themeInitScript } from "@/components/layout/theme";
import { cookies } from "next/headers";
import { SHOP_ORIGIN_COOKIE } from "@/lib/shop-origin";
import { siteOpenGraph } from "@/lib/seo/site";
import { Analytics } from "@/components/analytics/analytics";
import { analyticsConfig, hasAnalytics } from "@/lib/analytics/config";
import { CONSENT_COOKIE, parseConsent } from "@/lib/analytics/consent";
import { googleIds, googleInitSnippet, metaInitSnippet, siteTagsSnippet } from "@/lib/analytics/snippets";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// Famille du logo : titres et petits libellés (`globals.css`).
const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    title: {
      default: t("siteTitle"),
      template: "%s · ticketick.ch",
    },
    description: t("siteDescription"),
    metadataBase: new URL("https://ticketick.ch"),
    applicationName: "ticketick",
    appleWebApp: { title: "ticketick", statusBarStyle: "default" },
    openGraph: siteOpenGraph(locale),
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#1E1F23" },
  ],
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const cookieStore = await cookies();
  const analytics = analyticsConfig();
  const analyticsOn = hasAnalytics(analytics);
  const consent = parseConsent(cookieStore.get(CONSENT_COOKIE)?.value);

  return (
    <html lang={locale} className={`${inter.variable} ${jost.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {analyticsOn ? <script dangerouslySetInnerHTML={{ __html: siteTagsSnippet(analytics) }} /> : null}
        {googleIds(analytics).length > 0 ? (
          <script dangerouslySetInnerHTML={{ __html: googleInitSnippet(analytics, consent) }} />
        ) : null}
        {analytics.metaPixelId && consent === "granted" ? (
          <script dangerouslySetInnerHTML={{ __html: metaInitSnippet(analytics.metaPixelId) }} />
        ) : null}
      </head>
      <body className="min-h-full flex flex-col antialiased">
        <NextIntlClientProvider>
          <CartProvider>
            {/* La lecture de session vit sous `Suspense` : le reste de
                l'en-tête et la page conservent ainsi leur prérendu. */}
            <AppShell
              shopOrigin={cookieStore.get(SHOP_ORIGIN_COOKIE)?.value ?? null}
              cookieSettings={analyticsOn}
              accountSlot={
                <Suspense fallback={<AccountNavFallback />}>
                  <AccountNav />
                </Suspense>
              }
            >
              {children}
            </AppShell>
            {analyticsOn ? <Analytics config={analytics} initialConsent={consent} /> : null}
          </CartProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
