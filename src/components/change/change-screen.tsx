import { getTranslations } from "next-intl/server";
import { Clock, UserPlus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { intlLocale } from "@/lib/i18n-fallback";
import { exchangeOptions } from "@/lib/orders/exchange";
import type { ClientAccess } from "@/lib/orders/seat-change-actions";
import type { ChangePage } from "@/lib/orders/seat-change";
import { ticketPdfPath } from "@/lib/tickets/download";
import { t as translate } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { Exchanger } from "./exchanger";
import { ProgrammeCancel } from "./programme-cancel";
import { SeatChanger } from "./seat-changer";

/** Échange de spectacle puis choix des places, depuis un lien ou le compte. */
export async function ChangeScreen({
  data,
  access,
  locale,
  invite = false,
}: {
  data: Extract<ChangePage, { state: "open" }>;
  access: ClientAccess;
  locale: string;
  /** Client du lien sans compte : l'inviter à en créer un pour la prochaine fois. */
  invite?: boolean;
}) {
  const t = await getTranslations("change");
  const fmt = intlLocale(locale);
  const programme = data.programme;
  const tp = await getTranslations("change.programme");
  const exchange = await exchangeOptions({
    orderId: data.orderId,
    viaAccount: data.viaAccount,
    programmeSessionId: programme?.sessionId ?? null,
  });
  const canExchange = exchange.tickets.length > 0 && exchange.targets.length > 0;

  const exchanger = canExchange ? (
    <Exchanger
      programme={programme ? { refundMode: programme.refundMode } : undefined}
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
  ) : null;

  const intro = (
    <>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        {data.programme
          ? tp("order", { reference: data.reference })
          : t("intro", { reference: data.reference })}
      </p>
      {data.expiresAt ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="size-4 shrink-0" />
          {t("validUntil", { date: formatDate(data.expiresAt, fmt, { weekday: "long" }) })}
        </p>
      ) : null}
      {invite ? (
        <div className="mt-4 flex max-w-2xl flex-wrap items-center gap-3 rounded-card border border-border bg-card px-4 py-3 text-sm">
          <UserPlus className="size-5 shrink-0 text-primary" />
          <p className="min-w-0 flex-1">{t("inviteText", { email: data.email })}</p>
          <Link
            href={`/register?email=${encodeURIComponent(data.email)}&next=${encodeURIComponent("/account")}`}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            {t("inviteButton")}
          </Link>
        </div>
      ) : null}
      {exchange.locked > 0 ? (
        <p className="mt-4 max-w-2xl rounded-card border border-border bg-secondary px-4 py-3 text-sm">
          {t("lockedNote", { count: exchange.locked })}
        </p>
      ) : null}
      {data.pending ? (
        <p className="mt-4 rounded-card border border-border bg-secondary px-4 py-3 text-sm">
          {t("pending")}
        </p>
      ) : null}
    </>
  );

  if (programme) {
    const when = formatDate(programme.startsAt, fmt, { weekday: "long" });
    const show = translate(programme.eventTitle, locale);
    return (
      <>
        <div className="mt-4 max-w-3xl space-y-2 rounded-card border border-primary/30 bg-primary/5 px-5 py-4 text-sm">
          <p className="font-semibold">{tp("intro", { show, when })}</p>
          <p>{tp("keep")}</p>
          <p className="text-muted-foreground">{tp("others")}</p>
        </div>
        {intro}
        {programme.tickets.length === 0 ? (
          <p className="mt-8 rounded-card border border-border bg-card p-5 text-sm text-muted-foreground">
            {tp("nothingLeft")}
          </p>
        ) : (
          <div className="mt-8 space-y-10">
            <ProgrammeCancel
              access={access}
              locale={locale}
              currency={data.currency}
              refundMode={programme.refundMode}
              tickets={programme.tickets.map((ticket) => ({
                id: ticket.id,
                tariffName: translate(ticket.tariffName, locale),
                seatLabel: ticket.seatLabel,
                paidCents: ticket.paidCents,
              }))}
            />
            {exchanger}
          </div>
        )}
      </>
    );
  }

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
          {exchanger}
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
