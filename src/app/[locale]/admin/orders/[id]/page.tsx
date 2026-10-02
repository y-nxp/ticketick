import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { getAdminOrder } from "@/lib/data/admin";
import { getOrderEditContext } from "@/lib/data/admin-order-edit";
import { isCheckoutHoldEmail } from "@/lib/orders/create-order";
import { isAbandonedCardHold, isRefundDue } from "@/lib/orders/reservation";
import { t as translate, type Translated } from "@/lib/types";
import { formatDate, formatPrice } from "@/lib/utils";
import { OrderActions } from "../order-actions";
import { OrderEditor } from "./order-editor";

export const dynamic = "force-dynamic";

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const [order, user] = await Promise.all([getAdminOrder(id), getCurrentUser()]);
  if (!order) notFound();
  const readOnly = user?.role === "ORGANIZER_VIEWER";

  const t = await getTranslations("admin");
  const hold = isCheckoutHoldEmail(order.email);
  const abandoned = isAbandonedCardHold(order);
  const canMarkCash =
    order.status === "AWAITING_PAYMENT" || order.status === "PENDING";
  const canDownload =
    order.status === "PAID" ||
    order.status === "AWAITING_PAYMENT" ||
    order.status === "PENDING" ||
    order.tickets.length > 0;
  const canRefundPaypal =
    order.status === "PAID" &&
    order.payment?.provider === "paypal" &&
    order.payment.status === "COMPLETED";
  const canCancelReservation =
    order.status === "PAID" && order.paymentMethod === "RESERVATION";
  const editable = order.status === "PAID";
  const edit =
    !readOnly && !hold && (editable || canMarkCash)
      ? await getOrderEditContext(order.id, locale)
      : null;
  const fmt = `${locale}-CH`;
  const short = { weekday: undefined, year: undefined } as const;
  const openCharge = order.charges[0];

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
        {isRefundDue(order) ? (
          <Badge
            variant="outline"
            className="border-destructive/40 text-destructive"
          >
            {t("orders.refundDue")}
          </Badge>
        ) : abandoned ? (
          <Badge variant="outline" className="text-muted-foreground">
            {t("orders.abandoned")}
          </Badge>
        ) : openCharge ? (
          <Badge variant="outline">
            {t(`orders.chargeOpen.${openCharge.method}`)}
          </Badge>
        ) : (
          <Badge variant={order.status === "PAID" ? "default" : "secondary"}>
            {canCancelReservation
              ? t("orders.reserved")
              : t(`orderStatus.${order.status}`)}
          </Badge>
        )}
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
                  {`${order.firstName} ${order.lastName}`.trim() ||
                    t("orders.noName")}
                </p>
                {order.email ? (
                  <p className="text-muted-foreground">{order.email}</p>
                ) : null}
                {order.phone ? (
                  <p className="text-muted-foreground">{order.phone}</p>
                ) : null}
              </>
            )}
          </dd>
        </div>
        {order.ticketNote ? (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("orders.ticketNote")}
            </dt>
            <dd className="mt-1 text-sm font-medium">{order.ticketNote}</dd>
          </div>
        ) : null}
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
          {order.items.filter((item) => item.quantity > 0).map((item, index) => (
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
          {order.discounts.map((d, index) => (
            <li
              key={`discount-${index}`}
              className="flex items-start justify-between gap-4 px-4 py-3 text-sm"
            >
              <p>{translate(d.discount.label as Translated, locale)}</p>
              <p className="shrink-0 tabular-nums text-muted-foreground">
                −{formatPrice(d.amountCents, locale)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {order.tickets.length > 0 && !(edit && editable && !order.reseller) ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold">{t("orders.tickets")}</h2>
          <ul className="mt-2 divide-y divide-border rounded-2xl border border-border">
            {order.tickets.map((ticket) => (
              <li
                key={ticket.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-mono text-xs tracking-wider">{ticket.code}</p>
                  {ticket.seatLabel || ticket.attendeeName ? (
                    <p className="text-xs text-muted-foreground">
                      {[
                        ticket.seatLabel,
                        ticket.attendeeName,
                        ticket.attendeeBirthDate
                          ? swissDay(ticket.attendeeBirthDate)
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                </div>
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
      ) : edit?.order.charges.length ? null : (
        <p className="mt-6 text-sm text-muted-foreground">
          {t("orders.noPayment")}
        </p>
      )}

      {readOnly ? null : (
        <OrderActions
          orderId={order.id}
          reference={order.reference}
          canMarkCash={canMarkCash}
          canDownload={canDownload}
          canRefundPaypal={canRefundPaypal}
          canCancelReservation={canCancelReservation}
          paid={order.status === "PAID"}
        />
      )}

      {edit ? (
        <OrderEditor
          orderId={order.id}
          locale={locale}
          editable={editable}
          reseller={Boolean(edit.order.resellerId)}
          details={{
            firstName: edit.order.firstName,
            lastName: edit.order.lastName,
            email: edit.order.email,
            phone: edit.order.phone ?? "",
            ticketNote: edit.order.ticketNote ?? "",
            locale: edit.order.locale,
          }}
          tickets={edit.tickets}
          tariffs={edit.tariffs.map((tt) => ({
            id: tt.id,
            session: `${tt.event} · ${formatDate(tt.startsAt, fmt, short)}`,
            name: tt.name,
            priceCents: tt.priceCents,
            available: tt.available,
            invites: tt.invites,
          }))}
          charges={edit.order.charges.map((c) => ({
            id: c.id,
            number: c.number,
            kind: c.kind,
            method: c.method,
            status: c.status,
            amountCents: c.amountCents,
            due: c.dueAt ? formatDate(c.dueAt, fmt, short) : null,
            when: formatDate(c.settledAt ?? c.createdAt, fmt, short),
          }))}
          refundableCents={Math.max(
            0,
            edit.order.totalCents -
              edit.order.charges
                .filter(
                  (c) =>
                    c.kind === "REFUND" && (c.status === "OPEN" || c.status === "FAILED"),
                )
                .reduce((sum, c) => sum + c.amountCents, 0),
          )}
          providerRefund={edit.providerRefund}
          linkAvailable={edit.linkAvailable}
          seatedSessions={edit.seatedSessions.map((s) => ({
            id: s.id,
            label: `${s.label} · ${formatDate(s.startsAt, fmt, short)}`,
          }))}
        />
      ) : null}
    </div>
  );
}

function swissDay(date: Date): string {
  const [year, month, day] = date.toISOString().slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}
