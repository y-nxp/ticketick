import { getTranslations, setRequestLocale } from "next-intl/server";
import { Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { getAdminOrders } from "@/lib/data/admin";
import { isCheckoutHoldEmail } from "@/lib/orders/create-order";
import { isAbandonedCardHold } from "@/lib/orders/reservation";
import { t as translate, type Translated } from "@/lib/types";
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
          <p className="mt-3 text-sm text-muted-foreground">
            {t("orders.empty")}
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
              {orders.map((order) => {
                const eventTitle = firstEventTitle(order, locale);
                const hold = isCheckoutHoldEmail(order.email);
                return (
                  <tr key={order.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {order.reference}
                      </Link>
                      {eventTitle ? (
                        <p className="mt-0.5 font-sans text-xs text-muted-foreground">
                          {eventTitle}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {hold ? (
                        <p className="text-muted-foreground">
                          {t("orders.attempt")}
                        </p>
                      ) : (
                        <>
                          <p>
                            {order.firstName} {order.lastName}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {order.email}
                          </p>
                        </>
                      )}
                      {order.options.length > 0 ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {order.options
                            .map((o) =>
                              o.summary ? `${o.title} — ${o.summary}` : o.title,
                            )
                            .join(" · ")}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {order.reseller?.name ?? t(`channel.${order.channel}`)}
                    </td>
                    <td className="px-4 py-3">
                      {isAbandonedCardHold(order) ? (
                        <Badge
                          variant="outline"
                          className="text-muted-foreground"
                        >
                          {t("orders.abandoned")}
                        </Badge>
                      ) : (
                        <Badge
                          variant={
                            order.status === "PAID" ? "default" : "secondary"
                          }
                        >
                          {t(`orderStatus.${order.status}`)}
                        </Badge>
                      )}
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function firstEventTitle(
  order: {
    items: {
      ticketType: { session: { event: { title: unknown } } };
    }[];
  },
  locale: string,
): string {
  const title = order.items[0]?.ticketType.session.event.title;
  if (!title) return "";
  return translate(title as Translated, locale);
}
