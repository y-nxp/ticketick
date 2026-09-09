"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Minus, Plus, Check, ShoppingBag } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/cart/cart-context";
import { formatPrice } from "@/lib/utils";
import { t, type EventItem, type TicketType } from "@/lib/types";

export function TicketSelector({
  event,
  locale,
}: {
  event: EventItem;
  locale: string;
}) {
  const te = useTranslations("event");
  const { add } = useCart();
  const router = useRouter();
  const [qty, setQty] = React.useState<Record<string, number>>({});
  const [added, setAdded] = React.useState(false);

  const totalCents = event.ticketTypes.reduce(
    (sum, tt) => sum + (qty[tt.id] ?? 0) * tt.priceCents,
    0,
  );
  const totalCount = Object.values(qty).reduce((a, b) => a + b, 0);

  function setQuantity(id: string, next: number, max: number) {
    setQty((prev) => ({ ...prev, [id]: Math.max(0, Math.min(next, max)) }));
  }

  function addToCart(goToCheckout = false) {
    event.ticketTypes.forEach((tt) => {
      const n = qty[tt.id] ?? 0;
      if (n > 0) {
        add(
          {
            ticketTypeId: tt.id,
            eventId: event.id,
            eventSlug: event.slug,
            eventTitle: t(event.title, locale),
            ticketName: t(tt.name, locale),
            unitPriceCents: tt.priceCents,
            currency: tt.currency,
            coverImage: event.coverImage,
          },
          n,
        );
      }
    });
    setQty({});
    if (goToCheckout) {
      router.push("/cart");
    } else {
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="text-lg font-semibold">{te("selectTickets")}</h3>
      <div className="mt-4 space-y-3">
        {event.ticketTypes.map((tt) => (
          <TicketRow
            key={tt.id}
            ticket={tt}
            locale={locale}
            qty={qty[tt.id] ?? 0}
            onChange={(n) =>
              setQuantity(tt.id, n, Math.min(tt.maxPerOrder, tt.quantity - tt.sold))
            }
          />
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
        <span className="text-sm text-muted-foreground">{te("tickets")}</span>
        <span className="text-xl font-bold">
          {formatPrice(totalCents, `${locale}-CH`)}
        </span>
      </div>

      <div className="mt-4 space-y-2">
        <Button
          className="w-full"
          size="lg"
          disabled={totalCount === 0}
          onClick={() => addToCart(true)}
        >
          <ShoppingBag className="size-4" />
          {te("buyTickets")}
        </Button>
        <Button
          variant="outline"
          className="w-full"
          disabled={totalCount === 0}
          onClick={() => addToCart(false)}
        >
          {added ? (
            <>
              <Check className="size-4 text-[var(--success)]" />
              {te("addToCart")}
            </>
          ) : (
            te("addToCart")
          )}
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
}: {
  ticket: TicketType;
  locale: string;
  qty: number;
  onChange: (n: number) => void;
}) {
  const te = useTranslations("event");
  const remaining = ticket.quantity - ticket.sold;
  const soldOut = remaining <= 0;

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{t(ticket.name, locale)}</p>
        <p className="text-sm text-muted-foreground">
          {formatPrice(ticket.priceCents, `${locale}-CH`)}
          {soldOut && ` · ${te("soldOut")}`}
        </p>
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
            className="grid size-9 place-items-center rounded-full border border-border hover:bg-secondary"
          >
            <Plus className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
