import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getOrderSeatContext } from "@/lib/data/admin-order-edit";
import { seatLabel } from "@/lib/seating/layout";
import { t as translate, type Translated } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { SeatMover } from "./seat-mover";

export const dynamic = "force-dynamic";

export default async function OrderSeatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ session?: string }>;
}) {
  const { locale, id } = await params;
  const { session: sessionId } = await searchParams;
  setRequestLocale(locale);
  if (!sessionId) notFound();
  const t = await getTranslations("admin.orderEdit");

  const data = await getOrderSeatContext(id, sessionId);
  if (!data) notFound();
  const { order, session, layout, seats } = data;
  const zoneOf = new Map(seats.map((s) => [s.seatKey, s.zone]));

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={`/admin/orders/${order.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("seatsBack", { reference: order.reference })}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{t("seatsTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {translate(session.event.title as Translated, locale)}
          {" · "}
          {formatDate(session.startsAt, `${locale}-CH`)}
        </p>
      </header>

      {order.status !== "PAID" ? (
        <p className="text-sm text-muted-foreground">{t("errors.notEditable")}</p>
      ) : (
        <SeatMover
          orderId={order.id}
          sessionId={session.id}
          locale={locale}
          layout={layout}
          seats={seats.map((s) => ({ key: s.seatKey, zone: s.zone, status: s.status }))}
          tickets={order.tickets.map((ticket) => ({
            id: ticket.id,
            code: ticket.code,
            name: [translate(ticket.ticketType.name as Translated, locale), ticket.attendeeName]
              .filter(Boolean)
              .join(" · "),
            seatKey: ticket.seatKey,
            seat: ticket.seatKey ? seatLabel(layout, ticket.seatKey, locale) : null,
            zone: ticket.seatKey ? (zoneOf.get(ticket.seatKey) ?? null) : null,
            zones: ticket.ticketType.seatZones,
          }))}
        />
      )}
    </div>
  );
}
