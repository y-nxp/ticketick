"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, CheckCircle2, FileDown, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SeatLegend, SeatMap, type SeatState } from "@/components/seating/seat-map";
import {
  confirmSeatChangeAction,
  type ConfirmChangeState,
} from "@/lib/orders/seat-change-actions";
import {
  amountDue,
  newPriceCents,
  tariffForZone,
  type ChangeTariff,
} from "@/lib/orders/seat-change-quote";
import { seatLabel, zoneAllowed, type SeatLayout } from "@/lib/seating/layout";
import { cn, formatPrice } from "@/lib/utils";

export interface ChangerSession {
  id: string;
  title: string;
  when: string;
  venue: string | null;
  layout: SeatLayout;
  taken: string[];
  tariffs: (ChangeTariff & { name: string })[];
  tickets: {
    id: string;
    ticketTypeId: string;
    paidCents: number;
    seatKey: string;
    seatLabel: string | null;
    tariffName: string;
  }[];
}

export function SeatChanger({
  header,
  token,
  locale,
  currency,
  email,
  pdfUrl,
  sessions,
}: {
  header: React.ReactNode;
  token: string;
  locale: string;
  currency: string;
  email: string;
  pdfUrl: string;
  sessions: ChangerSession[];
}) {
  const t = useTranslations("change");
  const [moves, setMoves] = React.useState<Record<string, string>>({});
  const [active, setActive] = React.useState<string | null>(
    sessions[0]?.tickets[0]?.id ?? null,
  );
  const [refused, setRefused] = React.useState(false);
  const [state, setState] = React.useState<ConfirmChangeState | null>(null);
  const [pending, startTransition] = React.useTransition();
  const price = (cents: number) => formatPrice(cents, locale, currency);

  const lines = sessions.flatMap((session) =>
    session.tickets
      .filter((ticket) => moves[ticket.id])
      .map((ticket) => {
        const to = moves[ticket.id]!;
        const zone = session.layout.seats.find((s) => s.key === to)?.zone ?? "";
        const tariff = tariffForZone(ticket, zone, session.tariffs)!;
        const delta = newPriceCents(ticket, tariff) - ticket.paidCents;
        return { session, ticket, to, tariff, delta };
      }),
  );
  const due = amountDue(lines.map((l) => l.delta));
  const lower = lines.some((l) => l.delta < 0);

  if (state?.ok && state.kind === "done") {
    return (
      <div className="mx-auto mt-8 max-w-xl rounded-card border border-border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-[var(--success)]/12">
          <CheckCircle2 className="size-7 text-[var(--success)]" />
        </div>
        <h2 className="mt-4 text-2xl">{t("doneTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("doneText", { email })}</p>
        <a href={pdfUrl} target="_blank" rel="noreferrer" className="mt-6 block">
          <Button size="lg" variant="outline" className="w-full">
            <FileDown className="size-4" />
            {t("download")}
          </Button>
        </a>
      </div>
    );
  }

  function confirm() {
    const list = Object.entries(moves).map(([ticketId, to]) => ({ ticketId, to }));
    startTransition(async () => {
      const result = await confirmSeatChangeAction(token, list);
      if (result.ok && result.kind === "pay") {
        window.location.assign(result.url);
        return;
      }
      setState(result);
      if (result.ok) window.scrollTo({ top: 0 });
    });
  }

  return (
    <>
      {header}
      <div className="mt-8 space-y-8">
        {sessions.map((session) => (
          <SessionChanger
            key={session.id}
            session={session}
            locale={locale}
            moves={moves}
            active={active}
            price={price}
            onActive={(id) => {
              setRefused(false);
              setActive(id);
            }}
            onMove={(ticketId, to) => {
              setRefused(false);
              setState(null);
              const next = { ...moves };
              if (to) next[ticketId] = to;
              else delete next[ticketId];
              const rest = session.tickets.find((x) => !next[x.id] && x.id !== ticketId);
              setMoves(next);
              setActive(to ? (rest?.id ?? null) : ticketId);
            }}
            onRefused={() => setRefused(true)}
          />
        ))}

        {refused ? (
          <p role="alert" className="text-sm text-destructive">
            {t("refused")}
          </p>
        ) : null}

        <section className="rounded-card border border-border bg-card p-5 shadow-sm">
          <h2 className="text-lg">{t("summary")}</h2>
          {lines.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("nothingYet")}</p>
          ) : (
            <ul className="mt-3 divide-y divide-border rounded-control border border-border">
              {lines.map(({ session, ticket, to, tariff, delta }) => (
                <li key={ticket.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    {sessions.length > 1 ? (
                      <span className="block text-xs text-muted-foreground">{session.title}</span>
                    ) : null}
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-muted-foreground">{ticket.seatLabel}</span>
                      <ArrowRight className="size-3.5 shrink-0" />
                      <span className="font-semibold">{seatLabel(session.layout, to, locale)}</span>
                    </span>
                    {tariff.id !== ticket.ticketTypeId ? (
                      <span className="block text-xs text-muted-foreground">{tariff.name}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {delta > 0 ? `+ ${price(delta)}` : delta < 0 ? `− ${price(-delta)}` : t("same")}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex items-baseline justify-between">
            <span className="font-semibold">{t("due")}</span>
            <span className="text-xl font-extrabold tabular-nums">
              {due > 0 ? price(due) : t("free")}
            </span>
          </div>
          {lower ? <p className="mt-2 text-xs text-muted-foreground">{t("noRefund")}</p> : null}
          {due > 0 ? <p className="mt-2 text-xs text-muted-foreground">{t("keepNote")}</p> : null}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={confirm} disabled={pending || lines.length === 0}>
              {pending
                ? t("saving")
                : due > 0
                  ? t("confirmPay", { amount: price(due) })
                  : t("confirmFree")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending || lines.length === 0}
              onClick={() => {
                setMoves({});
                setState(null);
                setActive(sessions[0]?.tickets[0]?.id ?? null);
              }}
            >
              <Undo2 className="size-4" />
              {t("reset")}
            </Button>
          </div>
          {state && !state.ok ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {t(`errors.${ERRORS.includes(state.error) ? state.error : "failed"}`)}
            </p>
          ) : null}
        </section>
      </div>
    </>
  );
}

const ERRORS: string[] = ["seatsUnavailable", "soldOut", "expired", "used", "retry"];

function SessionChanger({
  session,
  locale,
  moves,
  active,
  price,
  onActive,
  onMove,
  onRefused,
}: {
  session: ChangerSession;
  locale: string;
  moves: Record<string, string>;
  active: string | null;
  price: (cents: number) => string;
  onActive: (id: string | null) => void;
  onMove: (ticketId: string, to: string | null) => void;
  onRefused: () => void;
}) {
  const t = useTranslations("change");
  const taken = React.useMemo(() => new Set(session.taken), [session.taken]);
  const zoneOf = React.useMemo(
    () => new Map(session.layout.seats.map((s) => [s.key, s.zone])),
    [session.layout],
  );
  const ownOf = new Map(session.tickets.map((x) => [x.seatKey, x]));
  const targets = new Map(
    session.tickets.filter((x) => moves[x.id]).map((x) => [moves[x.id]!, x.id]),
  );
  const activeTicket = session.tickets.find((x) => x.id === active) ?? null;

  function stateOf(key: string): SeatState {
    if (targets.has(key)) return "selected";
    if (ownOf.has(key)) return "mine";
    if (taken.has(key)) return "taken";
    const zone = zoneOf.get(key);
    if (!zone) return "off";
    if (activeTicket && !tariffForZone(activeTicket, zone, session.tariffs)) return "off";
    return "free";
  }

  function toggle(key: string) {
    const planned = targets.get(key);
    if (planned) return onMove(planned, null);
    const own = ownOf.get(key);
    if (own) return onActive(own.id === active ? null : own.id);
    if (taken.has(key)) return;
    const ticket = activeTicket ?? session.tickets.find((x) => !moves[x.id]) ?? null;
    if (!ticket) return;
    const zone = zoneOf.get(key);
    if (!zone || !tariffForZone(ticket, zone, session.tariffs)) return onRefused();
    onMove(ticket.id, key);
  }

  const mains = session.tariffs.filter((x) => !x.restricted);
  const uniform = mains.every((x) => x.seatZones.length === 0);
  const zonePrices: Record<string, string> = {};
  for (const zone of session.layout.zones) {
    const tariff = mains.find((x) => zoneAllowed(x.seatZones, zone.key));
    if (tariff) zonePrices[zone.key] = price(tariff.priceCents);
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl">{session.title}</h2>
        <p className="text-sm text-muted-foreground">
          {session.when}
          {session.venue ? ` · ${session.venue}` : ""}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <SeatMap
            layout={session.layout}
            locale={locale}
            stateOf={stateOf}
            onToggle={toggle}
            uniform={uniform}
          />
          <SeatLegend
            layout={session.layout}
            locale={locale}
            zonePrices={zonePrices}
            uniformPrice={uniform && mains[0] ? price(mains[0].priceCents) : undefined}
            mineLabel={t("current")}
          />
        </div>

        <div className="rounded-card border border-border bg-card p-4">
          <h3 className="font-semibold">{t("yourSeats")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>
          <ul className="mt-3 space-y-2">
            {session.tickets.map((ticket) => {
              const to = moves[ticket.id];
              const isActive = ticket.id === active;
              return (
                <li key={ticket.id}>
                  <button
                    type="button"
                    onClick={() => onActive(isActive ? null : ticket.id)}
                    aria-pressed={isActive}
                    className={cn(
                      "w-full rounded-control border px-3 py-2 text-left text-sm transition-colors",
                      isActive ? "border-primary bg-primary/10" : "border-border hover:bg-secondary",
                    )}
                  >
                    <span className="block text-xs text-muted-foreground">{ticket.tariffName}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span>{ticket.seatLabel}</span>
                      {to ? (
                        <>
                          <ArrowRight className="size-3.5" />
                          <span className="font-semibold">
                            {seatLabel(session.layout, to, locale)}
                          </span>
                        </>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
