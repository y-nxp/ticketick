"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { CheckCircle2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  confirmExchangeAction,
  type ClientAccess,
  type ExchangeState,
} from "@/lib/orders/seat-change-actions";
import { checkBasket, exchangeDue, type BasketTariff } from "@/lib/orders/self-service-rules";
import { cn, formatPrice } from "@/lib/utils";

export interface ExchangerTicket {
  id: string;
  ticketTypeId: string;
  title: string;
  when: string;
  tariffName: string;
  seatLabel: string | null;
  paidCents: number;
  holder: boolean;
}

export interface ExchangerTarget {
  sessionId: string;
  title: string;
  when: string;
  venue: string | null;
  seated: boolean;
  tariffs: (BasketTariff & { name: string })[];
}

const ERRORS: string[] = [
  "empty",
  "soldOut",
  "maxPerOrder",
  "companionRequiresPaid",
  "companionLimit",
  "attendeesMissing",
  "attendeeTooOld",
  "seatsUnavailable",
  "expired",
  "notFound",
  "retry",
];

export function Exchanger({
  access,
  locale,
  currency,
  tickets,
  targets,
}: {
  access: ClientAccess;
  locale: string;
  currency: string;
  tickets: ExchangerTicket[];
  targets: ExchangerTarget[];
}) {
  const t = useTranslations("change.exchange");
  const router = useRouter();
  const [give, setGive] = React.useState<string[]>([]);
  const [sessionId, setSessionId] = React.useState("");
  const [qty, setQty] = React.useState<Record<string, number>>({});
  const [state, setState] = React.useState<ExchangeState | null>(null);
  const [pending, startTransition] = React.useTransition();
  const price = (cents: number) => formatPrice(cents, locale, currency);

  const target = targets.find((s) => s.sessionId === sessionId) ?? null;
  const lines = target
    ? target.tariffs
        .map((tariff) => ({ tariff, quantity: qty[tariff.id] ?? 0 }))
        .filter((l) => l.quantity > 0)
    : [];
  const given = tickets.filter((x) => give.includes(x.id));
  const quote = exchangeDue({
    givenCents: given.map((x) => x.paidCents),
    lines: lines.map((l) => ({ priceCents: l.tariff.priceCents, quantity: l.quantity })),
  });
  const basket =
    target && lines.length > 0
      ? checkBasket({
          lines: lines.map((l) => ({ ticketTypeId: l.tariff.id, quantity: l.quantity })),
          tariffs: target.tariffs.map((tariff) => ({
            ...tariff,
            available:
              tariff.available + given.filter((x) => x.ticketTypeId === tariff.id).length,
          })),
          holders: given.filter((x) => x.holder).length,
        })
      : null;
  const ready = given.length > 0 && lines.length > 0 && basket?.ok === true;

  if (state?.ok && state.kind === "done") {
    return (
      <section className="rounded-card border border-border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-[var(--success)]/12">
          <CheckCircle2 className="size-7 text-[var(--success)]" />
        </div>
        <h2 className="mt-4 text-2xl">{t("doneTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("doneText")}</p>
        <Button
          className="mt-6"
          variant="outline"
          onClick={() => {
            setState(null);
            setGive([]);
            setSessionId("");
            setQty({});
            router.refresh();
          }}
        >
          {t("continue")}
        </Button>
      </section>
    );
  }

  function confirm() {
    if (!target) return;
    startTransition(async () => {
      const result = await confirmExchangeAction(access, {
        give,
        sessionId: target.sessionId,
        lines: lines.map((l) => ({ ticketTypeId: l.tariff.id, quantity: l.quantity })),
      });
      if (result.ok && result.kind === "pay") {
        window.location.assign(result.url);
        return;
      }
      setState(result);
      if (result.ok) router.refresh();
    });
  }

  const error = state && !state.ok ? state.error : basket && !basket.ok ? basket.error : null;

  return (
    <section className="rounded-card border border-border bg-card p-5 shadow-sm">
      <h2 className="text-xl">{t("title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("intro")}</p>

      <h3 className="mt-5 text-sm font-semibold">{t("giveTitle")}</h3>
      <ul className="mt-2 divide-y divide-border rounded-control border border-border">
        {tickets.map((ticket) => (
          <li key={ticket.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={give.includes(ticket.id)}
                onChange={(e) => {
                  setState(null);
                  setGive((prev) =>
                    e.target.checked ? [...prev, ticket.id] : prev.filter((x) => x !== ticket.id),
                  );
                }}
                className="size-4 accent-[var(--primary)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{ticket.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {ticket.when} · {ticket.tariffName}
                  {ticket.seatLabel ? ` · ${ticket.seatLabel}` : ""}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {ticket.paidCents > 0 ? price(ticket.paidCents) : t("freeTicket")}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <label className="mt-5 block text-sm font-semibold" htmlFor="exchange-target">
        {t("targetTitle")}
      </label>
      <select
        id="exchange-target"
        value={sessionId}
        onChange={(e) => {
          setState(null);
          setSessionId(e.target.value);
          setQty({});
        }}
        className="mt-2 h-11 w-full rounded-control border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
      >
        <option value="">{t("targetPlaceholder")}</option>
        {targets.map((s) => (
          <option key={s.sessionId} value={s.sessionId}>
            {s.title} — {s.when}
            {s.venue ? ` — ${s.venue}` : ""}
          </option>
        ))}
      </select>

      {target ? (
        <>
          <ul className="mt-4 divide-y divide-border rounded-control border border-border">
            {target.tariffs.map((tariff) => {
              const n = qty[tariff.id] ?? 0;
              const freed = given.filter((x) => x.ticketTypeId === tariff.id).length;
              const max = Math.min(tariff.available + freed, tariff.maxPerOrder);
              const set = (value: number) => {
                setState(null);
                setQty((prev) => ({ ...prev, [tariff.id]: Math.max(0, Math.min(max, value)) }));
              };
              return (
                <li key={tariff.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{tariff.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {tariff.priceCents > 0 ? price(tariff.priceCents) : t("freeTicket")}
                      {max === 0 ? ` · ${t("soldOutTariff")}` : ""}
                      {tariff.requiresAttendee ? ` · ${t("namedTariff")}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label={t("less")}
                      disabled={n === 0}
                      onClick={() => set(n - 1)}
                    >
                      <Minus className="size-4" />
                    </Button>
                    <span className="w-6 text-center tabular-nums">{n}</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label={t("more")}
                      disabled={n >= max}
                      onClick={() => set(n + 1)}
                    >
                      <Plus className="size-4" />
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
          {target.seated ? (
            <p className="mt-2 text-xs text-muted-foreground">{t("seatsAssigned")}</p>
          ) : null}
        </>
      ) : null}

      <div className="mt-5 space-y-1 border-t border-border pt-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("givenValue")}</span>
          <span className="tabular-nums">{price(quote.givenCents)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("newValue")}</span>
          <span className="tabular-nums">{price(quote.newCents)}</span>
        </div>
        <div className="flex items-baseline justify-between pt-1">
          <span className="font-semibold">{t("due")}</span>
          <span className="text-xl font-extrabold tabular-nums">
            {quote.dueCents > 0 ? price(quote.dueCents) : t("free")}
          </span>
        </div>
        {lines.length > 0 && quote.newCents < quote.givenCents ? (
          <p className="text-xs text-muted-foreground">{t("noRefund")}</p>
        ) : null}
        {quote.dueCents > 0 ? (
          <p className="text-xs text-muted-foreground">{t("keepNote")}</p>
        ) : null}
      </div>

      <Button className="mt-5" onClick={confirm} disabled={pending || !ready}>
        {pending
          ? t("saving")
          : quote.dueCents > 0
            ? t("confirmPay", { amount: price(quote.dueCents) })
            : t("confirmFree")}
      </Button>
      {error && (given.length > 0 || (state && !state.ok)) ? (
        <p role="alert" className={cn("mt-3 text-sm text-destructive")}>
          {t(`errors.${ERRORS.includes(error) ? error : "failed"}`)}
        </p>
      ) : null}
    </section>
  );
}
