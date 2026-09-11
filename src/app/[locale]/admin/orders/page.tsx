import { getTranslations, setRequestLocale } from "next-intl/server";
import { Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getAdminOrders } from "@/lib/data/admin";
import { formatDate, formatPrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const orders = await getAdminOrders();
  const t = await getTranslations("admin");

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{t("orders.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("orders.subtitle")}
      </p>

      {orders.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border p-10 text-center">
          <Receipt className="mx-auto size-6 text-muted-foreground" />
          {/* Le tunnel d'achat ne persiste encore rien : le dire vaut mieux
              qu'un tableau vide qu'on prendrait pour une absence de ventes. */}
          <p className="mt-3 text-sm text-muted-foreground">
            {t("orders.notWiredYet")}
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">
                  {t("orders.reference")}
                </th>
                <th className="px-4 py-3 font-semibold">
                  {t("orders.customer")}
                </th>
                <th className="px-4 py-3 font-semibold">
                  {t("orders.channel")}
                </th>
                <th className="px-4 py-3 font-semibold">
                  {t("orders.status")}
                </th>
                <th className="px-4 py-3 font-semibold">{t("orders.date")}</th>
                <th className="px-4 py-3 text-right font-semibold">
                  {t("orders.total")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">
                    {order.reference}
                  </td>
                  <td className="px-4 py-3">{order.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {order.reseller?.name ?? t(`channel.${order.channel}`)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        order.status === "PAID" ? "default" : "secondary"
                      }
                    >
                      {t(`orderStatus.${order.status}`)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(order.createdAt, `${locale}-CH`, {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatPrice(order.totalCents, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
