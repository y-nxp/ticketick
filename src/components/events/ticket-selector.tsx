"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { usePathname } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/cart/cart-context";
import { rememberShopOrigin } from "@/lib/shop-origin";
import { formatDate, formatPrice } from "@/lib/utils";
import {
  t,
  type EventItem,
  type SessionItem,
  type TicketType,
} from "@/lib/types";

export function TicketSelector({
  event,
  session,
  locale,
}: {
  event: EventItem;
  /** Séance retenue : c'est elle qui porte les tarifs et le stock. */
  session: SessionItem;
  locale: string;
  /** Dans un iframe : le paiement s'ouvre dans la fenêtre parente. */
  embed?: boolean;
}) {
  const te = useTranslations("event");
  const { add, previewOpen } = useCart();
  const pathname = usePathname();
  const [qty, setQty] = React.useState<Record<string, number>>({});

  const totalCents = session.ticketTypes.reduce(
    (sum, tt) => sum + (qty[tt.id] ?? 0) * tt.priceCents,
    0,
  );
  const totalCount = Object.values(qty).reduce((a, b) => a + b, 0);

  function maxFor(tt: TicketType, current: Record<string, number>) {
    const resteTarif = Math.max(0, tt.quantity - tt.sold);
    const autres = session.ticketTypes.reduce(
      (sum, x) => (x.id === tt.id ? sum : sum + (current[x.id] ?? 0)),
      0,
    );
    const resteJauge =
      session.capacity == null
        ? Number.POSITIVE_INFINITY
        : Math.max(0, session.capacity - session.sold - autres);
    let max = Math.min(tt.maxPerOrder, resteTarif, resteJauge);
    if (tt.maxPerPaidTicket != null) {
      const payants = session.ticketTypes.reduce((sum, x) => {
        if (x.maxPerPaidTicket != null || x.priceCents <= 0) return sum;
        return sum + (current[x.id] ?? 0);
      }, 0);
      max = Math.min(max, payants * tt.maxPerPaidTicket);
    }
    return max;
  }

  function setQuantity(id: string, next: number) {
    setQty((prev) => {
      const tt = session.ticketTypes.find((x) => x.id === id);
      if (!tt) return prev;
      const max = maxFor(tt, prev);
      const suivant = { ...prev, [id]: Math.max(0, Math.min(next, max)) };
      // Baisser les payants doit ramener les gratuits sous le nouveau plafond.
      for (const autre of session.ticketTypes) {
        if (autre.maxPerPaidTicket == null) continue;
        const plafond = maxFor(autre, suivant);
        if ((suivant[autre.id] ?? 0) > plafond) suivant[autre.id] = plafond;
      }
      return suivant;
    });
  }

  function addToCart() {
    session.ticketTypes.forEach((tt) => {
      const n = qty[tt.id] ?? 0;
      if (n > 0) {
        add(
          {
            ticketTypeId: tt.id,
            eventId: event.id,
            eventSlug: event.slug,
            eventTitle: t(event.title, locale),
            sessionId: session.id,
            sessionStartsAt: session.startsAt,
            ticketName: t(tt.name, locale),
            unitPriceCents: tt.priceCents,
            currency: tt.currency,
            coverImage: event.coverImage,
          },
          n,
        );
      }
    });
    rememberShopOrigin(pathname);
    setQty({});
  }

  const pending = totalCount > 0;

  return (
    <div
      id="ticket-selector"
      className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <h3 className="text-xl font-semibold">{te("selectTickets")}</h3>
      <p className="mt-2 font-medium leading-snug">{t(event.title, locale)}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {formatDate(session.startsAt, `${locale}-CH`)}
        {session.label ? ` · ${t(session.label, locale)}` : null}
      </p>
      <div className="mt-4 space-y-3">
        {session.ticketTypes.map((tt) => (
          <TicketRow
            key={tt.id}
            ticket={tt}
            locale={locale}
            qty={qty[tt.id] ?? 0}
            onChange={(n) => setQuantity(tt.id, n)}
            max={maxFor(tt, qty)}
          />
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
        <span className="text-sm text-muted-foreground">{te("tickets")}</span>
        <span className="text-xl font-bold">
          {formatPrice(totalCents, `${locale}-CH`)}
        </span>
      </div>

      <div className="mt-4">
        <Button
          className="w-full"
          size="lg"
          disabled={!pending || previewOpen}
          onClick={addToCart}
        >
          <ShoppingBag className="size-4" />
          {te("addToCart")}
        </Button>
      </div>
    </div>
  );
}

function TicketRow({
  ticket,
  locale,
  qty,
  onChange,
  max,
}: {
  ticket: TicketType;
  locale: string;
  qty: number;
  onChange: (n: number) => void;
  max: number;
}) {
  const te = useTranslations("event");
  const remaining = ticket.quantity - ticket.sold;
  const soldOut = remaining <= 0;
  // La règle n'apparaît qu'une fois le plafond atteint : avant ça, le
  // bouton « + » suffit à découvrir qu'on peut encore en ajouter.
  const hint =
    ticket.maxPerPaidTicket != null
      ? !soldOut && qty > 0 && qty >= max
        ? te("companionNeedsPaid")
        : null
      : ticket.description
        ? t(ticket.description, locale)
        : null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{t(ticket.name, locale)}</p>
        <p className="text-sm text-muted-foreground">
          {ticket.priceCents === 0
            ? te("free")
            : formatPrice(ticket.priceCents, `${locale}-CH`)}
          {soldOut && ` · ${te("soldOut")}`}
        </p>
        {hint ? (
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      {soldOut ? (
        <span className="text-sm font-medium text-muted-foreground">
          {te("soldOut")}
        </span>
      ) : (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange(qty - 1)}
            disabled={qty === 0}
            className="grid size-9 place-items-center rounded-full border border-border hover:bg-secondary disabled:opacity-40"
          >
            <Minus className="size-4" />
          </button>
          <span className="w-8 text-center font-semibold tabular-nums">
            {qty}
          </span>
          <button
            type="button"
            onClick={() => onChange(qty + 1)}
            disabled={qty >= max}
            className="grid size-9 place-items-center rounded-full border border-border hover:bg-secondary disabled:opacity-40"
          >
            <Plus className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
