import { getTranslations, setRequestLocale } from "next-intl/server";
import { Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getAdminResellers } from "@/lib/data/admin";
import { formatPrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminResellersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const resellers = await getAdminResellers();
  const t = await getTranslations("admin");

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">
        {t("resellers.title")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("resellers.subtitle")}
      </p>

      {resellers.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border p-10 text-center">
          <Store className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            {t("resellers.empty")}
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">
                  {t("resellers.name")}
                </th>
                <th className="px-4 py-3 font-semibold">
                  {t("resellers.type")}
                </th>
                <th className="px-4 py-3 text-right font-semibold">
                  {t("resellers.commission")}
                </th>
                <th className="px-4 py-3 text-right font-semibold">
                  {t("resellers.orders")}
                </th>
                <th className="px-4 py-3 text-right font-semibold">
                  {t("resellers.balance")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {resellers.map((reseller) => (
                <tr key={reseller.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <p className="font-medium">{reseller.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("resellers.agents", {
                        count: reseller._count.agents,
                      })}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={reseller.active ? "secondary" : "outline"}>
                      {t(`resellerType.${reseller.type}`)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {/* Points de base : 250 se lit 2,50 %. */}
                    {(reseller.commissionBps / 100).toFixed(2)} %
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {reseller._count.orders}
                  </td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums ${
                      reseller.balanceCents < 0 ? "text-destructive" : ""
                    }`}
                  >
                    {formatPrice(reseller.balanceCents, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        {t("resellers.balanceHint")}
      </p>
    </div>
  );
}
