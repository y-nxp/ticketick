import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getSeatPlan } from "@/lib/data/admin-seat-plans";
import { layoutToDraft } from "@/lib/seating/draft";
import { PlanEditor } from "../../plan-editor";

export const dynamic = "force-dynamic";

export default async function EditSeatPlanPage({
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
          <Link href={`/admin/seat-plans/${plan.id}`} className="hover:text-foreground">
            ← {plan.name}
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{t("editTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {plan.venue.name}, {plan.venue.city}
        </p>
      </header>
      <PlanEditor
        initial={layoutToDraft(plan.layout)}
        name={plan.name}
        planId={plan.id}
        inUseSessions={plan._count.sessions}
        lockedKeys={plan.lockedKeys}
      />
    </div>
  );
}
