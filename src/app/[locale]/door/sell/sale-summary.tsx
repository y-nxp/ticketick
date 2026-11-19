import { getTranslations } from "next-intl/server";
import { CheckCircle2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getDoorSaleSummary } from "@/lib/door/sale";
import { t as translate, type Translated } from "@/lib/types";
import { EVENT_TIME_ZONE, formatPrice } from "@/lib/utils";

/** Vente enregistrée : billets, sièges, et la suite (nouvelle vente). */
export async function SaleSummary({
  orderId,
  locale,
  again,
}: {
  orderId: string;
  locale: string;
  again?: boolean;
}) {
  const t = await getTranslations("door.sell");
  const order = await getDoorSaleSummary(orderId);
  if (!order) return null;
  const intl = `${locale}-CH`;
  const session = order.tickets[0]?.ticketType.session;
  const used = order.tickets.length > 0 && order.tickets.every((ticket) => ticket.status === "USED");
  const groups = new Map<string, string[]>();
  for (const ticket of order.tickets) {
    const name = translate(ticket.ticketType.name as Translated, locale);
    groups.set(name, [...(groups.get(name) ?? []), ticket.seatLabel ?? ""]);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-card border border-emerald-600/30 bg-emerald-50 p-5 text-center dark:bg-emerald-950/30">
        <CheckCircle2 className="mx-auto size-10 text-emerald-600" />
        <p className="mt-2 text-lg font-semibold">{again ? t("alreadyRecorded") : t("recorded")}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {order.totalCents > 0 ? formatPrice(order.totalCents, intl) : t("free")} · {order.reference}
        </p>
        <p className="mt-1 text-sm">{used ? t("ticketsUsed") : t("ticketsValid")}</p>
      </div>
      {session ? (
        <p className="text-sm text-muted-foreground">
          {translate(session.event.title as Translated, locale)} ·{" "}
          {new Intl.DateTimeFormat(intl, {
            timeZone: EVENT_TIME_ZONE,
            weekday: "short",
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          }).format(session.startsAt)}
        </p>
      ) : null}
      <ul className="divide-y divide-border rounded-card border border-border bg-card">
        {[...groups.entries()].map(([name, seats]) => (
          <li key={name} className="px-4 py-3">
            <p className="font-medium">
              {seats.length}× {name}
            </p>
            {seats.some(Boolean) ? (
              <p className="text-sm text-muted-foreground">{seats.filter(Boolean).join(", ")}</p>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="grid gap-2">
        <Link
          href="/door/sell"
          className="flex h-14 items-center justify-center rounded-control bg-primary text-base font-medium text-primary-foreground"
        >
          {t("next")}
        </Link>
        <Link href="/door" className="flex h-11 items-center justify-center rounded-control border border-border text-sm">
          {t("toDoor")}
        </Link>
      </div>
    </div>
  );
}
