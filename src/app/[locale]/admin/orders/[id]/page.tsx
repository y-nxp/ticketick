import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { getAdminOrder } from "@/lib/data/admin";
import { isCheckoutHoldEmail } from "@/lib/orders/create-order";
import { t as translate, type Translated } from "@/lib/types";
import { formatDate, formatPrice } from "@/lib/utils";
import { OrderActions } from "../order-actions";

export const dynamic = "force-dynamic";

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const order = await getAdminOrder(id);
  if (!order) notFound();

  const t = await getTranslations("admin");
  const hold = isCheckoutHoldEmail(order.email);
  const canMarkCash =
    order.status === "AWAITING_PAYMENT" || order.status === "PENDING";
  const canDownload =
    order.status === "PAID" ||
    order.status === "AWAITING_PAYMENT" ||
    order.status === "PENDING" ||
    order.tickets.length > 0;

  return (
    <div>
      <Link
        href="/admin/orders"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("orders.back")}
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("orders.detailTitle", { reference: order.reference })}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("orders.detailSubtitle")}
          </p>
        </div>
        <Badge variant={order.status === "PAID" ? "default" : "secondary"}>
          {t(`orderStatus.${order.status}`)}
        </Badge>
      </div>

      <dl className="mt-6 grid gap-4 rounded-2xl border border-border p-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("orders.customer")}
          </dt>
          <dd className="mt-1 text-sm">
            {hold ? (
              t("orders.attempt")
            ) : (
              <>
                <p>
                  {order.firstName} {order.lastName}
                </p>
                <p className="text-muted-foreground">{order.email}</p>
                {order.phone ? (
                  <p className="text-muted-foreground">{order.phone}</p>
                ) : null}
              </>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("orders.date")}
          </dt>
          <dd className="mt-1 text-sm">
            {formatDate(order.createdAt, `${locale}-CH`, {
              day: "2-digit",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("orders.channel")}
          </dt>
          <dd className="mt-1 text-sm">
            {order.reseller?.name ?? t(`channel.${order.channel}`)}
            {order.paymentMethod ? (
              <span className="text-muted-foreground">
                {" · "}
                {t(`paymentMethod.${order.paymentMethod}`)}
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("orders.total")}
          </dt>
          <dd className="mt-1 text-sm font-semibold tabular-nums">
            {formatPrice(order.totalCents, locale)}
          </dd>
        </div>
      </dl>

      <section className="mt-6">
        <h2 className="text-sm font-semibold">{t("orders.items")}</h2>
        <ul className="mt-2 divide-y divide-border rounded-2xl border border-border">
          {order.items.map((item, index) => (
            <li
              key={`${item.ticketType.session.event.title}-${index}`}
              className="flex items-start justify-between gap-4 px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  {translate(
                    item.ticketType.session.event.title as Translated,
                    locale,
                  )}
                </p>
                <p className="text-muted-foreground">
                  {translate(item.ticketType.name as Translated, locale)}
                  {" · "}
                  {formatDate(
                    item.ticketType.session.startsAt,
                    `${locale}-CH`,
                    {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    },
                  )}
                </p>
              </div>
              <p className="shrink-0 tabular-nums text-muted-foreground">
                {item.quantity} × {formatPrice(item.unitPriceCents, locale)}
              </p>
            </li>
          ))}
          {order.options.map((option) => (
            <li
              key={`${option.title}-${option.summary}`}
              className="flex items-start justify-between gap-4 px-4 py-3 text-sm"
            >
              <p>
                {option.title}
                {option.summary ? (
                  <span className="text-muted-foreground">
                    {" — "}
                    {option.summary}
                  </span>
                ) : null}
              </p>
              <p className="shrink-0 tabular-nums text-muted-foreground">
                {formatPrice(option.amountCents, locale)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {order.tickets.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold">{t("orders.tickets")}</h2>
          <ul className="mt-2 divide-y divide-border rounded-2xl border border-border">
            {order.tickets.map((ticket) => (
              <li
                key={ticket.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <p className="font-mono text-xs tracking-wider">{ticket.code}</p>
                <Badge
                  variant={ticket.status === "VALID" ? "default" : "secondary"}
                >
                  {t(`ticketStatus.${ticket.status}`)}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {order.payment ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {t("orders.payment")}: {t(`paymentMethod.${order.payment.method}`)} ·{" "}
          {order.payment.provider} · {order.payment.status}
        </p>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">
          {t("orders.noPayment")}
        </p>
      )}

      <OrderActions
        orderId={order.id}
        reference={order.reference}
        canMarkCash={canMarkCash}
        canDownload={canDownload}
      />
    </div>
  );
}
