import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, Sparkles, ShieldCheck, Mail, Ticket } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ThreeBars } from "@/components/ui/three-bars";
import { EventsBrowser } from "@/components/events/events-browser";
import { EventCard } from "@/components/events/event-card";
import {
  getCategories,
  getCities,
  getFeaturedEvents,
  getPublishedEvents,
} from "@/lib/data/events";
import { routing } from "@/i18n/routing";
import { jsonLdScript } from "@/lib/seo/event";
import { pageAlternates, siteJsonLd } from "@/lib/seo/site";

// Catalogue et stocks vivent en base : rendu à la demande.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { alternates: pageAlternates("", locale, routing.locales) };
}

export default async function HomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  const { q } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations("home");
  const te = await getTranslations("event");
  const tm = await getTranslations("meta");

  const [events, featured, cities, categories] = await Promise.all([
    getPublishedEvents(),
    getFeaturedEvents(),
    getCities(),
    getCategories(),
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(siteJsonLd(locale, tm("siteDescription"))),
        }}
      />
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/8 via-background to-background" />
        <div
          className="absolute inset-x-0 top-0 -z-10 h-96 opacity-[0.15]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, var(--primary), transparent 40%), radial-gradient(circle at 80% 0%, var(--primary), transparent 35%)",
          }}
        />
        <div className="container-page py-16 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="brand-label inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs shadow-sm">
              <Sparkles className="size-4 text-primary" />
              {t("heroBadge")} 🇨🇭
            </span>
            <h1 className="mt-6 text-4xl sm:text-6xl">
              {t("heroTitle")}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
              {t("heroSubtitle")}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="#events">
                <Button size="lg" className="gap-2">
                  {t("heroCta")}
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
              <Link href="/how-it-works">
                <Button size="lg" variant="outline">
                  {t("heroSecondary")}
                </Button>
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="size-4 text-[var(--success)]" />
                {t("payments")}
              </span>
              <span className="inline-flex items-center gap-2">
                <Mail className="size-4 text-primary" />
                {t("ticketsByEmail")}
              </span>
              {/* Masqué tant que rien n'est à l'affiche : « 0+ billets »
                  annoncerait le vide comme un argument de vente. */}
              {events.length > 0 && (
                <span className="inline-flex items-center gap-2">
                  <Ticket className="size-4 text-primary" />
                  {events.length}+ {te("tickets").toLowerCase()}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* FEATURED */}
      {featured.length > 0 && (
        <section className="container-page">
          <div className="mb-5 flex items-end justify-between">
            <h2 className="flex items-center gap-3 text-2xl">
              <ThreeBars />
              {t("sectionFeatured")}
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.slice(0, 3).map((event) => (
              <EventCard
                key={event.id}
                event={event}
                locale={locale}
                labels={{
                  from: te("from"),
                  soldOut: te("soldOut"),
                  dates: (n) => te("datesCount", { count: n }),
                  onRegistration: te("contact.badge"),
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* ALL EVENTS + FILTERS */}
      <section id="events" className="container-page mt-16 scroll-mt-20">
        <h2 className="mb-6 flex items-center gap-3 text-2xl">
          <ThreeBars />
          {t("sectionAll")}
        </h2>
        <EventsBrowser
          events={events}
          categories={categories}
          cities={cities}
          locale={locale}
          initialQuery={q ?? ""}
        />
      </section>
    </>
  );
}
