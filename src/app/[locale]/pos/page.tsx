import { getTranslations, setRequestLocale } from "next-intl/server";
import { TicketPlus } from "lucide-react";
import { PosEventsTable, PosTotalsCards } from "@/components/resellers/pos-stats";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireResellerAgent } from "@/lib/auth/dal";
import { getPosHome } from "@/lib/resellers/data";

export const dynamic = "force-dynamic";

export default async function PosOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const agent = await requireResellerAgent("/pos");
  const t = await getTranslations("pos");
  const { reseller, stats } = await getPosHome(agent);
  const organizers = new Set(stats.events.map((e) => e.organizerName));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">{t("overview.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("overview.subtitle", { name: reseller.name })}
          </p>
        </div>
        <Link href="/pos/sell" className={buttonVariants()}>
          <TicketPlus className="size-4" />
          {t("nav.sell")}
        </Link>
      </header>
      <PosTotalsCards stats={stats} locale={locale} />
      <section className="space-y-3">
        <h2 className="text-lg">{t("overview.shows")}</h2>
        <PosEventsTable
          events={stats.events}
          locale={locale}
          showOrganizer={organizers.size > 1}
          sellable
        />
      </section>
    </div>
  );
}
