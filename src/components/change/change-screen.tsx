import { getTranslations } from "next-intl/server";
import { Clock } from "lucide-react";
import { intlLocale } from "@/lib/i18n-fallback";
import { exchangeOptions } from "@/lib/orders/exchange";
import type { ClientAccess } from "@/lib/orders/seat-change-actions";
import type { ChangePage } from "@/lib/orders/seat-change";
import { ticketPdfPath } from "@/lib/tickets/download";
import { t as translate } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { Exchanger } from "./exchanger";
import { SeatChanger } from "./seat-changer";

/** Échange de spectacle puis choix des places, depuis un lien ou le compte. */
export async function ChangeScreen({
  data,
  access,
  locale,
}: {
  data: Extract<ChangePage, { state: "open" }>;
  access: ClientAccess;
  locale: string;
}) {
  const t = await getTranslations("change");
  const fmt = intlLocale(locale);
  const exchange = await exchangeOptions({ orderId: data.orderId, viaAccount: data.viaAccount });
  const canExchange = exchange.tickets.length > 0 && exchange.targets.length > 0;

  const intro = (
    <>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        {t("intro", { reference: data.reference })}
      </p>
      {data.expiresAt ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="size-4 shrink-0" />
          {t("validUntil", { date: formatDate(data.expiresAt, fmt, { weekday: "long" }) })}
        </p>
      ) : null}
      {data.pending ? (
        <p className="mt-4 rounded-card border border-border bg-secondary px-4 py-3 text-sm">
          {t("pending")}
        </p>
      ) : null}
    </>
  );

  if (!canExchange && data.sessions.length === 0) {
    return (
      <>
        {intro}
        <p className="mt-8 rounded-card border border-border bg-card p-5 text-sm text-muted-foreground">
          {t("nothingToChange")}
        </p>
      </>
    );
  }

  return (
    <>
      {intro}
      {canExchange ? (
        <div className="mt-6">
          <Exchanger
            access={access}
            locale={locale}
            currency={data.currency}
            tickets={exchange.tickets.map((ticket) => ({
              id: ticket.id,
              ticketTypeId: ticket.ticketTypeId,
              sessionId: ticket.sessionId,
              seatKey: ticket.seatKey,
              title: translate(ticket.eventTitle, locale),
              when: formatDate(ticket.startsAt, fmt, { weekday: "long" }),
              tariffName: translate(ticket.tariffName, locale),
              seatLabel: ticket.seatLabel,
              paidCents: ticket.paidCents,
              holder: ticket.holder,
            }))}
            targets={exchange.targets.map((target) => ({
              sessionId: target.sessionId,
              title: translate(target.eventTitle, locale),
              when: formatDate(target.startsAt, fmt, { weekday: "long" }),
              startsAt: target.startsAt.toISOString(),
              coverImage: target.coverImage,
              categories: target.categories.map((c) => ({
                id: c.id,
                name: translate(c.name, locale),
                color: c.color,
              })),
              tags: target.tags
                ? translate(target.tags, locale)
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean)
                : [],
              venue: target.venue,
              seated: target.seated,
              tariffs: target.tariffs.map((tariff) => ({
                ...tariff,
                name: translate(tariff.name, locale),
              })),
            }))}
          />
        </div>
      ) : null}

      {!canExchange && data.sessions.length > 0 ? (
        <div className="mt-10">
          <SeatChanger
            header={
              <>
                <h2 className="text-2xl">{t("seatsTitle")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("seatsIntro")}</p>
              </>
            }
            access={access}
            locale={locale}
            currency={data.currency}
            email={data.email}
            pdfUrl={ticketPdfPath(data.reference)}
            sessions={data.sessions.map((session) => {
              const nameOf = new Map(session.tariffs.map((x) => [x.id, translate(x.name, locale)]));
              return {
                id: session.id,
                title: translate(session.eventTitle, locale),
                when: formatDate(session.startsAt, fmt, { weekday: "long" }),
                venue: session.venue,
                layout: session.layout,
                taken: session.taken,
                tariffs: session.tariffs.map((x) => ({
                  id: x.id,
                  name: nameOf.get(x.id) ?? "",
                  priceCents: x.priceCents,
                  seatZones: x.seatZones,
                  restricted: x.restricted,
                  available: x.available,
                })),
                tickets: session.tickets.map((ticket) => ({
                  ...ticket,
                  tariffName: nameOf.get(ticket.ticketTypeId) ?? "",
                })),
              };
            })}
          />
        </div>
      ) : null}
    </>
  );
}
