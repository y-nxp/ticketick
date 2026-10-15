"use client";

import * as React from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CheckCircle2, ChevronRight, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventCardContent, eventCardClass } from "@/components/events/event-card";
import {
  confirmExchangeAction,
  type ClientAccess,
  type ExchangeState,
} from "@/lib/orders/seat-change-actions";
import { checkBasket, exchangeDue } from "@/lib/orders/self-service-rules";
import { cn, formatPrice } from "@/lib/utils";
import { ExchangeSeatPicker, type PickerTariff, type SeatPick } from "./exchange-seat-picker";

export interface ExchangerTicket {
  id: string;
  ticketTypeId: string;
  sessionId: string;
  seatKey: string | null;
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
  startsAt: string;
  coverImage: string;
  categories: { id: string; name: string; color: string }[];
  tags: string[];
  venue: string | null;
  seated: boolean;
  tariffs: PickerTariff[];
}

const STEPS = ["tickets", "show", "seats", "confirm"] as const;

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
  const top = React.useRef<HTMLElement>(null);
  const [step, setStep] = React.useState(0);
  const [give, setGive] = React.useState<string[]>([]);
  const [sessionId, setSessionId] = React.useState("");
  const [qty, setQty] = React.useState<Record<string, number>>({});
  const [picks, setPicks] = React.useState<SeatPick[]>([]);
  const [state, setState] = React.useState<ExchangeState | null>(null);
  const [pending, startTransition] = React.useTransition();
  const price = (cents: number) => formatPrice(cents, locale, currency);

  const given = tickets.filter((x) => give.includes(x.id));
  const freedOf = (ticketTypeId: string) =>
    given.filter((x) => x.ticketTypeId === ticketTypeId).length;
  const target = targets.find((s) => s.sessionId === sessionId) ?? null;
  const tariffs = (target?.tariffs ?? []).map((tariff) => ({
    ...tariff,
    // Les places rendues sur la même séance repartent en vente.
    available: tariff.available + freedOf(tariff.id),
  }));
  const seated = target?.seated === true;
  const lines = tariffs
    .map((tariff) => {
      if (!seated) return { tariff, quantity: qty[tariff.id] ?? 0, seats: [] as SeatPick[] };
      const seats = picks.filter((p) => p.ticketTypeId === tariff.id);
      return { tariff, quantity: seats.length, seats };
    })
    .filter((l) => l.quantity > 0);
  const ownSeats = new Set(
    tickets.flatMap((x) => (x.sessionId === sessionId && x.seatKey ? [x.seatKey] : [])),
  );
  const quote = exchangeDue({
    givenCents: given.map((x) => x.paidCents),
    lines: lines.map((l) => ({ priceCents: l.tariff.priceCents, quantity: l.quantity })),
  });
  const basket =
    lines.length > 0
      ? checkBasket({
          lines: lines.map((l) => ({ ticketTypeId: l.tariff.id, quantity: l.quantity })),
          tariffs,
          holders: given.filter((x) => x.holder).length,
        })
      : null;
  const ready = given.length > 0 && target !== null && basket?.ok === true;
  const reachable = [true, given.length > 0, given.length > 0 && target !== null, ready];

  function go(next: number) {
    if (!reachable[next]) return;
    setState(null);
    setStep(next);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function reset() {
    setState(null);
    setGive([]);
    setSessionId("");
    setQty({});
    setPicks([]);
    setStep(0);
  }

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
            reset();
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
        lines: lines.map((l) => ({
          ticketTypeId: l.tariff.id,
          quantity: l.quantity,
          ...(seated ? { seatKeys: l.seats.map((p) => p.key) } : {}),
        })),
      });
      if (result.ok && result.kind === "pay") {
        window.location.assign(result.url);
        return;
      }
      setState(result);
      if (result.ok) router.refresh();
    });
  }

  const errorText = (code: string) => t(`errors.${ERRORS.includes(code) ? code : "failed"}`);

  return (
    <section ref={top} className="scroll-mt-24 rounded-card border border-border bg-card p-5 shadow-sm">
      <h2 className="text-xl">{t("title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("intro")}</p>

      <nav aria-label={t("stepsLabel")} className="mt-5">
        <ol className="flex items-center gap-x-0.5 overflow-x-auto text-sm sm:flex-wrap sm:gap-x-1 sm:gap-y-2">
          {STEPS.map((key, i) => {
            const current = i === step;
            const done = i < step;
            return (
              <li key={key} className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                {i > 0 ? (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                ) : null}
                <button
                  type="button"
                  onClick={() => go(i)}
                  disabled={current || !reachable[i]}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "inline-flex items-center gap-2 whitespace-nowrap rounded-full px-1 py-1 transition-colors sm:px-2",
                    current
                      ? "font-semibold text-foreground"
                      : reachable[i]
                        ? "text-muted-foreground hover:bg-secondary hover:text-foreground"
                        : "cursor-not-allowed text-muted-foreground/60",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                      current
                        ? "bg-primary text-primary-foreground"
                        : done
                          ? "bg-secondary text-foreground"
                          : "border border-border",
                    )}
                  >
                    {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
                  </span>
                  <span className={cn(!current && "sr-only sm:not-sr-only")}>
                    {t(`steps.${key}`)}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="mt-6">
        {step === 0 ? (
          <>
            <h3 className="text-lg">{t("giveTitle")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t("giveHint")}</p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {tickets.map((ticket) => {
                const selected = give.includes(ticket.id);
                return (
                  <li key={ticket.id}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        setGive((prev) =>
                          selected ? prev.filter((x) => x !== ticket.id) : [...prev, ticket.id],
                        )
                      }
                      className={cn(
                        "flex h-full w-full items-start gap-3 rounded-card border p-4 text-left text-sm transition-colors",
                        selected
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:bg-secondary",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "mt-0.5 grid size-5 shrink-0 place-items-center rounded border",
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background",
                        )}
                      >
                        {selected ? <Check className="size-3.5" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{ticket.title}</span>
                        <span className="mt-0.5 block text-muted-foreground">{ticket.when}</span>
                        <span className="mt-0.5 block text-muted-foreground">
                          {ticket.tariffName}
                          {ticket.seatLabel ? ` · ${ticket.seatLabel}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 font-medium tabular-nums">
                        {ticket.paidCents > 0 ? price(ticket.paidCents) : t("freeTicket")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <StepFooter>
              <p className="text-sm text-muted-foreground">
                {t("selectedCount", { count: given.length })}
                {given.length > 0 ? ` · ${price(quote.givenCents)}` : ""}
              </p>
              <Button onClick={() => go(1)} disabled={!reachable[1]}>
                {t("next")}
              </Button>
            </StepFooter>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <h3 className="text-lg">{t("targetTitle")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t("targetHint")}</p>
            <ul className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {targets.map((s) => {
                const open = s.tariffs.map((x) => ({ ...x, left: x.available + freedOf(x.id) }));
                const soldOut = open.every((x) => x.left === 0);
                const paid = open.filter((x) => x.priceCents > 0 && x.left > 0);
                const from = Math.min(
                  ...(paid.length > 0 ? paid : open).map((x) => x.priceCents),
                );
                const selected = s.sessionId === sessionId;
                return (
                  <li key={s.sessionId} className="flex">
                    <button
                      type="button"
                      aria-pressed={selected}
                      disabled={soldOut}
                      onClick={() => {
                        if (!selected) {
                          setQty({});
                          setPicks([]);
                        }
                        setSessionId(s.sessionId);
                        setState(null);
                        setStep(2);
                        top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      className={cn(
                        eventCardClass,
                        "w-full text-left disabled:pointer-events-none disabled:opacity-60",
                        selected && "border-primary ring-2 ring-primary",
                      )}
                    >
                      <EventCardContent
                        locale={locale}
                        title={s.title}
                        coverImage={s.coverImage}
                        startsAt={s.startsAt}
                        venue={s.venue ?? undefined}
                        categories={s.categories}
                        tags={s.tags}
                        soldOut={soldOut}
                        soldOutLabel={t("soldOut")}
                        footer={
                          soldOut ? (
                            <span className="text-sm font-medium">{t("soldOut")}</span>
                          ) : (
                            <>
                              <span className="text-xs text-muted-foreground">{t("from")}</span>
                              <span className="text-base font-bold">
                                {from > 0 ? price(from) : t("freeTicket")}
                              </span>
                            </>
                          )
                        }
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
            <StepFooter>
              <Button variant="outline" onClick={() => go(0)}>
                <ArrowLeft className="size-4" />
                {t("back")}
              </Button>
            </StepFooter>
          </>
        ) : null}

        {step === 2 && target ? (
          <>
            <ChosenShow target={target} onChange={() => go(1)} label={t("changeShow")} />
            {seated ? (
              <div className="mt-6">
                <ExchangeSeatPicker
                  key={target.sessionId}
                  sessionId={target.sessionId}
                  locale={locale}
                  tariffs={tariffs}
                  picks={picks}
                  onPicks={(next) => {
                    setState(null);
                    setPicks(next);
                  }}
                  ownSeats={ownSeats}
                  price={price}
                />
              </div>
            ) : (
              <>
                <h3 className="mt-6 text-lg">{t("seatsTitle")}</h3>
                <ul className="mt-3 divide-y divide-border rounded-control border border-border">
                  {tariffs.map((tariff) => {
                    const n = qty[tariff.id] ?? 0;
                    const max = Math.min(tariff.available, tariff.maxPerOrder);
                    const set = (value: number) => {
                      setState(null);
                      setQty((prev) => ({ ...prev, [tariff.id]: Math.max(0, Math.min(max, value)) }));
                    };
                    return (
                      <li key={tariff.id} className="flex items-center gap-3 px-3 py-3 text-sm">
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
              </>
            )}
            {basket && !basket.ok ? (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {errorText(basket.error)}
              </p>
            ) : null}
            <StepFooter>
              <Button variant="outline" onClick={() => go(1)}>
                <ArrowLeft className="size-4" />
                {t("back")}
              </Button>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  {t("due")} :{" "}
                  <span className="font-semibold text-foreground tabular-nums">
                    {quote.dueCents > 0 ? price(quote.dueCents) : t("free")}
                  </span>
                </span>
                <Button onClick={() => go(3)} disabled={!reachable[3]}>
                  {t("next")}
                </Button>
              </div>
            </StepFooter>
          </>
        ) : null}

        {step === 3 && target ? (
          <>
            <h3 className="text-lg">{t("confirmTitle")}</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-card border border-border p-4">
                <p className="text-sm font-semibold">{t("youGive")}</p>
                <ul className="mt-2 space-y-2 text-sm">
                  {given.map((ticket) => (
                    <li key={ticket.id} className="flex justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block">{ticket.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {ticket.when} · {ticket.tariffName}
                          {ticket.seatLabel ? ` · ${ticket.seatLabel}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {ticket.paidCents > 0 ? price(ticket.paidCents) : t("freeTicket")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-card border border-border p-4">
                <p className="text-sm font-semibold">{t("youGet")}</p>
                <p className="mt-2 text-sm">{target.title}</p>
                <p className="text-xs text-muted-foreground">
                  {target.when}
                  {target.venue ? ` · ${target.venue}` : ""}
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {seated
                    ? lines.flatMap(({ tariff, seats }) =>
                        seats.map((seat) => (
                          <li key={seat.key} className="flex justify-between gap-3">
                            <span className="min-w-0">
                              <span className="block">{seat.label}</span>
                              <span className="block text-xs text-muted-foreground">{tariff.name}</span>
                            </span>
                            <span className="shrink-0 tabular-nums">
                              {tariff.priceCents > 0 ? price(tariff.priceCents) : t("freeTicket")}
                            </span>
                          </li>
                        )),
                      )
                    : lines.map(({ tariff, quantity }) => (
                        <li key={tariff.id} className="flex justify-between gap-3">
                          <span>
                            {quantity} × {tariff.name}
                          </span>
                          <span className="shrink-0 tabular-nums">
                            {tariff.priceCents > 0
                              ? price(tariff.priceCents * quantity)
                              : t("freeTicket")}
                          </span>
                        </li>
                      ))}
                </ul>
              </div>
            </div>

            <div className="mt-5 space-y-1 text-sm">
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
              {quote.newCents < quote.givenCents ? (
                <p className="text-xs text-muted-foreground">{t("noRefund")}</p>
              ) : null}
              {quote.dueCents > 0 ? (
                <p className="text-xs text-muted-foreground">{t("keepNote")}</p>
              ) : null}
            </div>

            {state && !state.ok ? (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {errorText(state.error)}
              </p>
            ) : null}
            <StepFooter>
              <Button variant="outline" onClick={() => go(2)} disabled={pending}>
                <ArrowLeft className="size-4" />
                {t("back")}
              </Button>
              <Button onClick={confirm} disabled={pending || !ready}>
                {pending
                  ? t("saving")
                  : quote.dueCents > 0
                    ? t("confirmPay", { amount: price(quote.dueCents) })
                    : t("confirmFree")}
              </Button>
            </StepFooter>
          </>
        ) : null}
      </div>
    </section>
  );
}

function StepFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      {children}
    </div>
  );
}

function ChosenShow({
  target,
  onChange,
  label,
}: {
  target: ExchangerTarget;
  onChange: () => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-card border border-border p-3">
      {target.coverImage ? (
        <div className="relative size-16 shrink-0 overflow-hidden rounded-lg">
          <Image src={target.coverImage} alt="" fill sizes="64px" className="object-cover" />
        </div>
      ) : null}
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">{target.title}</p>
        <p className="text-muted-foreground">
          {target.when}
          {target.venue ? ` · ${target.venue}` : ""}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onChange}>
        {label}
      </Button>
    </div>
  );
}
