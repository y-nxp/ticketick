import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
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

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ticketick.ch — La billetterie suisse",
    template: "%s · ticketick.ch",
  },
  description:
    "Réservez vos billets pour les meilleurs spectacles de Suisse : concerts, théâtre, festivals, humour et plus.",
  metadataBase: new URL("https://ticketick.ch"),
  applicationName: "ticketick",
  appleWebApp: { title: "ticketick", statusBarStyle: "default" },
};

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

  return (
    <html lang={locale} className={`${inter.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col antialiased">
        <NextIntlClientProvider>
          <CartProvider>
            {/* La lecture de session vit sous `Suspense` : le reste de
                l'en-tête et la page conservent ainsi leur prérendu. */}
            <AppShell
              shopOrigin={
                (await cookies()).get(SHOP_ORIGIN_COOKIE)?.value ?? null
              }
              accountSlot={
                <Suspense fallback={<AccountNavFallback />}>
                  <AccountNav />
                </Suspense>
              }
            >
              {children}
            </AppShell>
          </CartProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
