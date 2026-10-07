import { getTranslations, setRequestLocale } from "next-intl/server";
import { Plus, Store } from "lucide-react";
import { ruleLabel } from "@/components/resellers/pos-stats";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getManagedResellers } from "@/lib/resellers/data";
import { formatPrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminResellersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { admin, resellers } = await getManagedResellers();
  const t = await getTranslations("admin");
  const money = (cents: number) => formatPrice(cents, `${locale}-CH`);
  const rules = await Promise.all(resellers.map((r) => ruleLabel(r.rule, locale)));

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">{t("resellers.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("resellers.subtitle")}</p>
        </div>
        <Link href="/admin/resellers/new" className={buttonVariants()}>
          <Plus className="size-4" />
          {t("resellers.new")}
        </Link>
      </header>

      {resellers.length === 0 ? (
        <div className="mt-6 rounded-card border border-dashed border-border p-10 text-center">
          <Store className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">{t("resellers.empty")}</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-card border border-border">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t("resellers.name")}</th>
                <th className="px-4 py-3 font-medium">{t("resellers.commission")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("resellers.tickets")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("resellers.amount")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("resellers.commissionTotal")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("resellers.balance")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {resellers.map((reseller, i) => (
                <tr key={reseller.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/resellers/${reseller.id}`}
                      className="font-medium hover:text-primary hover:underline"
                    >
                      {reseller.name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {[
                        t(`resellerType.${reseller.type}`),
                        reseller.city,
                        admin ? (reseller.organizer?.name ?? t("resellers.allOrganizers")) : null,
                        t("resellers.showsCount", { count: reseller._count.events }),
                        t("resellers.agents", { count: reseller._count.agents }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {!reseller.active ? (
                      <Badge variant="outline" className="mt-1">
                        {t("resellers.inactive")}
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{rules[i]}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{reseller.totals.tickets}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(reseller.totals.amountCents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {money(reseller.totals.commissionCents)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums ${
                      reseller.balanceCents < 0 ? "text-destructive" : ""
                    }`}
                  >
                    {money(reseller.balanceCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">{t("resellers.balanceHint")}</p>
    </div>
  );
}
