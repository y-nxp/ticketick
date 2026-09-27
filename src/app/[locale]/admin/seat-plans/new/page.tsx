import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getPlanVenues } from "@/lib/data/admin-seat-plans";
import { PlanImporter } from "./plan-importer";

export const dynamic = "force-dynamic";

export default async function NewSeatPlanPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.seatPlans");
  const venues = await getPlanVenues();
  const aiEnabled = Boolean(process.env.LITELLM_API_URL && process.env.LITELLM_API_KEY);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">
          <Link href="/admin/seat-plans" className="hover:text-foreground">
            {t("back")}
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{t("importTitle")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("importSubtitle")}</p>
      </header>
      <PlanImporter venues={venues} aiEnabled={aiEnabled} />
    </div>
  );
}
