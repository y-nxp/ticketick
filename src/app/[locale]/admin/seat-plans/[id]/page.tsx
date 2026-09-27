import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getSeatPlan } from "@/lib/data/admin-seat-plans";
import { DeletePlan, PlanPreview } from "./plan-preview";

export const dynamic = "force-dynamic";

export default async function SeatPlanPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.seatPlans");
  const plan = await getSeatPlan(id);
  if (!plan) notFound();

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">
          <Link href="/admin/seat-plans" className="hover:text-foreground">
            {t("back")}
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{plan.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {plan.venue.name}, {plan.venue.city}
          {" · "}
          {t("seatCount", { count: plan.layout.seats.length })}
          {" · "}
          {t("sessionCount", { count: plan._count.sessions })}
        </p>
      </header>

      <PlanPreview layout={plan.layout} locale={locale} />

      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="mb-3 text-sm text-muted-foreground">{t("useHint")}</p>
        <DeletePlan id={plan.id} inUse={plan._count.sessions > 0} />
      </section>
    </div>
  );
}
