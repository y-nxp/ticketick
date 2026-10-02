"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/admin/fields";
import { SeatMap, type SeatState } from "@/components/seating/seat-map";
import { moveSeatsAction } from "@/lib/admin/order-edit-actions";
import type { FormState } from "@/lib/admin/types";
import { seatLabel, zoneAllowed, type SeatLayout } from "@/lib/seating/layout";
import { cn } from "@/lib/utils";

interface MoverTicket {
  id: string;
  code: string;
  name: string;
  seatKey: string | null;
  seat: string | null;
  zone: string | null;
  zones: string[];
}

interface MoverSeat {
  key: string;
  zone: string;
  status: "AVAILABLE" | "RESERVED" | "BLOCKED";
}

export function SeatMover({
  orderId,
  sessionId,
  locale,
  layout,
  seats,
  tickets,
}: {
  orderId: string;
  sessionId: string;
  locale: string;
  layout: SeatLayout;
  seats: MoverSeat[];
  tickets: MoverTicket[];
}) {
  const t = useTranslations("admin.orderEdit");
  const movable = tickets.filter((x) => x.seatKey);
  const [active, setActive] = React.useState<string | null>(movable[0]?.id ?? null);
  const [moves, setMoves] = React.useState<Record<string, string>>({});
  const [refused, setRefused] = React.useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const result = await moveSeatsAction(prev, formData);
      if (result?.ok) setMoves({});
      return result;
    },
    undefined,
  );

  const byKey = new Map(seats.map((s) => [s.key, s]));
  const ticketOf = new Map(movable.map((x) => [x.seatKey!, x]));
  const targets = new Map(Object.entries(moves).map(([ticketId, key]) => [key, ticketId]));
  const activeTicket = movable.find((x) => x.id === active) ?? null;

  function stateOf(key: string): SeatState {
    if (activeTicket?.seatKey === key) return "selected";
    if (targets.has(key)) return "selected";
    const own = ticketOf.get(key);
    if (own) return moves[own.id] ? "taken" : "mine";
    const seat = byKey.get(key);
    if (!seat) return "off";
    if (seat.status === "RESERVED") return "taken";
    if (activeTicket && !zoneAllowed(activeTicket.zones, seat.zone)) return "off";
    return seat.status === "BLOCKED" ? "blocked" : "free";
  }

  function toggle(key: string) {
    setRefused(false);
    const planned = targets.get(key);
    if (planned) {
      setMoves((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => id !== planned)));
      setActive(planned);
      return;
    }
    if (!activeTicket || activeTicket.seatKey === key) {
      setActive(null);
      return;
    }
    const seat = byKey.get(key);
    if (!seat || !zoneAllowed(activeTicket.zones, seat.zone)) {
      setRefused(true);
      return;
    }
    const next = { ...moves, [activeTicket.id]: key };
    setMoves(next);
    setActive(movable.find((x) => !next[x.id] && x.id !== activeTicket.id)?.id ?? null);
  }

  const list = Object.entries(moves).map(([ticketId, to]) => ({ ticketId, to }));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <SeatMap layout={layout} locale={locale} stateOf={stateOf} onToggle={toggle} />

      <div className="space-y-5">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">{t("seatsTickets")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("seatsHint")}</p>
          <ul className="mt-3 space-y-2">
            {tickets.map((ticket) => {
              const to = moves[ticket.id];
              const isActive = ticket.id === active;
              return (
                <li key={ticket.id}>
                  <button
                    type="button"
                    disabled={!ticket.seatKey}
                    onClick={() => setActive(isActive ? null : ticket.id)}
                    aria-pressed={isActive}
                    className={cn(
                      "w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors disabled:opacity-60",
                      isActive
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-secondary",
                    )}
                  >
                    <span className="block font-mono text-xs tracking-wider">{ticket.code}</span>
                    <span className="block text-xs text-muted-foreground">{ticket.name}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span>{ticket.seat ?? t("seatsNoSeat")}</span>
                      {to ? (
                        <>
                          <ArrowRight className="size-3.5" />
                          <span className="font-semibold">{seatLabel(layout, to, locale)}</span>
                        </>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {refused ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {t("errors.seatsUnavailable")}
            </p>
          ) : null}
        </section>

        <form action={action} className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="moves" value={JSON.stringify(list)} />
          <Checkbox name="toInvites" label={t("seatsToInvites")} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending || list.length === 0}>
              {pending ? t("saving") : t("seatsSave", { count: list.length })}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending || list.length === 0}
              onClick={() => {
                setMoves({});
                setActive(movable[0]?.id ?? null);
              }}
            >
              <Undo2 className="size-4" />
              {t("seatsReset")}
            </Button>
          </div>
          {state?.ok ? (
            <p role="status" className="text-sm text-[var(--success)]">
              {t("done.moved")}
            </p>
          ) : null}
          {state && !state.ok ? (
            <p role="alert" className="text-sm text-destructive">
              {t(`errors.${state.error}`)}
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
