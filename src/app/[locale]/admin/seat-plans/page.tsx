import { getTranslations, setRequestLocale } from "next-intl/server";
import { Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { getSeatPlans } from "@/lib/data/admin-seat-plans";
import { t as translate } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SeatPlansPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.seatPlans");
  const plans = await getSeatPlans();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Link href="/admin/seat-plans/new" className={buttonVariants()}>
          <Plus className="size-4" />
          {t("import")}
        </Link>
      </header>

      {plans.length === 0 ? (
        <p className="rounded-card border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">{t("name")}</th>
                <th className="px-4 py-3 font-semibold">{t("venue")}</th>
                <th className="px-4 py-3 font-semibold">{t("zones")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("seats")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("sessions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {plans.map((plan) => (
                <tr key={plan.id}>
                  <td className="px-4 py-2.5 font-medium">
                    <Link href={`/admin/seat-plans/${plan.id}`} className="hover:text-primary">
                      {plan.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {plan.venue.name}, {plan.venue.city}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="flex flex-wrap gap-1.5">
                      {plan.zones.map((z) => (
                        <span
                          key={z.key}
                          title={translate(z.name, locale)}
                          className="inline-block size-3.5 rounded-[3px] border border-black/20"
                          style={{ background: z.color }}
                        />
                      ))}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{plan.seatCount}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{plan._count.sessions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
