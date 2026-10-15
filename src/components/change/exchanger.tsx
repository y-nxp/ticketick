"use client";

import * as React from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Minus,
  Pencil,
  Plus,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventCardContent, eventCardClass } from "@/components/events/event-card";
import {
  confirmExchangeAction,
  type ClientAccess,
  type ExchangeState,
} from "@/lib/orders/seat-change-actions";
import { checkBasket, exchangeDue, tariffRoom } from "@/lib/orders/self-service-rules";
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
  holder: Attendee | null;
}

interface Attendee {
  name: string;
  /** AAAA-MM-JJ */
  birthDate: string;
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

/** Choix sur un spectacle : places du plan, ou nombre de places par tarif sans plan. */
interface CartEntry {
  qty: Record<string, number>;
  picks: SeatPick[];
}

interface Line {
  tariff: PickerTariff;
  quantity: number;
  seats: SeatPick[];
}

interface CartShow {
  target: ExchangerTarget;
  tariffs: PickerTariff[];
  lines: Line[];
}

/** Une place nominative du panier, à remplir au récapitulatif. */
interface Slot {
  key: string;
  sessionId: string;
  ticketTypeId: string;
  legend: string;
  maxAgeYears: number | null;
}

const EMPTY: CartEntry = { qty: {}, picks: [] };
const NO_ATTENDEE: Attendee = { name: "", birthDate: "" };

/** Mêmes exigences que le serveur : prénom et nom, date complète. */
function attendeeComplete(a: Attendee): boolean {
  const name = a.name.trim().replace(/\s+/g, " ");
  return name.length >= 3 && name.includes(" ") && /^\d{4}-\d{2}-\d{2}$/.test(a.birthDate);
}

const STEPS = ["tickets", "show", "seats", "confirm"] as const;

const ERRORS: string[] = [
  "empty",
  "soldOut",
  "maxPerOrder",
  "companionRequiresPaid",
  "companionLimit",
  "attendeesMissing",
  "attendeeInvalid",
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
  const tc = useTranslations("checkout");
  const te = useTranslations("event");
  const router = useRouter();
  const top = React.useRef<HTMLElement>(null);
  const [step, setStep] = React.useState(0);
  const [give, setGive] = React.useState<string[]>([]);
  const [cart, setCart] = React.useState<Record<string, CartEntry>>({});
  const [attendees, setAttendees] = React.useState<Record<string, Attendee>>({});
  const [sessionId, setSessionId] = React.useState("");
  const [state, setState] = React.useState<ExchangeState | null>(null);
  const [pending, startTransition] = React.useTransition();
  const price = (cents: number) => formatPrice(cents, locale, currency);

  const given = tickets.filter((x) => give.includes(x.id));
  const freedOf = (ticketTypeId: string) =>
    given.filter((x) => x.ticketTypeId === ticketTypeId).length;
  // Les places rendues sur la même séance repartent en vente.
  const tariffsOf = (target: ExchangerTarget) =>
    target.tariffs.map((tariff) => ({ ...tariff, available: tariff.available + freedOf(tariff.id) }));
  const linesOf = (target: ExchangerTarget, tariffs: PickerTariff[], entry: CartEntry): Line[] =>
    tariffs
      .map((tariff) => {
        if (!target.seated) return { tariff, quantity: entry.qty[tariff.id] ?? 0, seats: [] };
        const seats = entry.picks.filter((p) => p.ticketTypeId === tariff.id);
        return { tariff, quantity: seats.length, seats };
      })
      .filter((l) => l.quantity > 0);

  const shows: CartShow[] = targets.flatMap((target) => {
    const entry = cart[target.sessionId];
    if (!entry) return [];
    const tariffs = tariffsOf(target);
    const lines = linesOf(target, tariffs, entry);
    if (lines.length === 0) return [];
    return [{ target, tariffs, lines }];
  });
  const checkOf = (show: CartShow) =>
    checkBasket({
      lines: show.lines.map((l) => ({ ticketTypeId: l.tariff.id, quantity: l.quantity })),
      tariffs: show.tariffs,
    });
  const failing = shows
    .map((show) => ({ show, check: checkOf(show) }))
    .find(({ check }) => !check.ok);
  const seatCount = shows.reduce(
    (sum, s) => sum + s.lines.reduce((n, l) => n + l.quantity, 0),
    0,
  );
  const quote = exchangeDue({
    givenCents: given.map((x) => x.paidCents),
    lines: shows.flatMap((s) =>
      s.lines.map((l) => ({ priceCents: l.tariff.priceCents, quantity: l.quantity })),
    ),
  });
  const ready = shows.length > 0 && !failing;

  const slots: Slot[] = shows.flatMap(({ target: show, lines }) =>
    lines.flatMap(({ tariff, quantity, seats }) =>
      tariff.requiresAttendee
        ? Array.from({ length: quantity }, (_, i) => ({
            key: `${show.sessionId}|${tariff.id}|${seats[i]?.key ?? i}`,
            sessionId: show.sessionId,
            ticketTypeId: tariff.id,
            legend: [show.title, tariff.name, seats[i]?.label].filter(Boolean).join(" · "),
            maxAgeYears: tariff.maxAgeYears,
          }))
        : [],
    ),
  );
  // Les bénéficiaires des billets rendus sont proposés d'avance, dans l'ordre.
  const holders = given.flatMap((x) => (x.holder ? [x.holder] : []));
  const attendeeOf = (slot: Slot, index: number) =>
    attendees[slot.key] ?? holders[index] ?? NO_ATTENDEE;
  const attendeesDone = slots.every((slot, i) => attendeeComplete(attendeeOf(slot, i)));

  function setAttendee(slot: Slot, index: number, patch: Partial<Attendee>) {
    setState(null);
    setAttendees((prev) => ({ ...prev, [slot.key]: { ...attendeeOf(slot, index), ...patch } }));
  }

  const target = targets.find((s) => s.sessionId === sessionId) ?? null;
  const entry = cart[sessionId] ?? EMPTY;
  const tariffs = target ? tariffsOf(target) : [];
  const here = shows.find((s) => s.target.sessionId === sessionId) ?? null;
  const hereCheck = here ? checkOf(here) : null;
  const roomOf = (id: string, counts: Record<string, number>) =>
    tariffRoom({ ticketTypeId: id, counts, tariffs });
  const ownSeats = new Set(
    tickets.flatMap((x) => (x.sessionId === sessionId && x.seatKey ? [x.seatKey] : [])),
  );

  const reachable = [true, true, target !== null, ready];

  function go(next: number) {
    if (!reachable[next]) return;
    setState(null);
    setStep(next);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openShow(id: string) {
    setSessionId(id);
    setState(null);
    setStep(2);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function updateEntry(id: string, patch: Partial<CartEntry>) {
    setState(null);
    setCart((prev) => ({ ...prev, [id]: { ...(prev[id] ?? EMPTY), ...patch } }));
  }

  function removeShow(id: string) {
    setState(null);
    setCart((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  /** Les gratuités suivent les places payantes. */
  function setQuantity(ticketTypeId: string, value: number) {
    const next = { ...entry.qty, [ticketTypeId]: Math.max(0, value) };
    const companionsLast = [...tariffs].sort(
      (a, b) => Number(a.maxPerPaidTicket != null) - Number(b.maxPerPaidTicket != null),
    );
    for (const tariff of companionsLast) {
      next[tariff.id] = Math.min(next[tariff.id] ?? 0, roomOf(tariff.id, next));
    }
    updateEntry(sessionId, { qty: next });
  }

  function reset() {
    setState(null);
    setGive([]);
    setCart({});
    setAttendees({});
    setSessionId("");
    setStep(0);
  }

  if (state?.ok && state.kind === "done") {
    return (
      <section className="rounded-card border border-border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-[var(--success)]/12">
          <CheckCircle2 className="size-7 text-[var(--success)]" />
        </div>
        <h2 className="mt-4 text-2xl">{t("doneTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(given.length > 0 ? "doneText" : "doneTextAdded")}
        </p>
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
    if (!ready || !attendeesDone) return;
    const attendeesFor = (sid: string, ticketTypeId: string) =>
      slots.flatMap((slot, i) =>
        slot.sessionId === sid && slot.ticketTypeId === ticketTypeId ? [attendeeOf(slot, i)] : [],
      );
    startTransition(async () => {
      const result = await confirmExchangeAction(access, {
        give,
        items: shows.map((show) => ({
          sessionId: show.target.sessionId,
          lines: show.lines.map((l) => ({
            ticketTypeId: l.tariff.id,
            quantity: l.quantity,
            ...(show.target.seated ? { seatKeys: l.seats.map((p) => p.key) } : {}),
            ...(l.tariff.requiresAttendee
              ? { attendees: attendeesFor(show.target.sessionId, l.tariff.id) }
              : {}),
          })),
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
  const dueLabel = quote.dueCents > 0 ? price(quote.dueCents) : t("free");

  const cartBar =
    shows.length > 0 ? (
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
        <span className="inline-flex items-center gap-2">
          <ShoppingBag className="size-4 shrink-0" />
          <span>
            <span className="font-medium">{t("cartTitle")}</span> ·{" "}
            {t("cartSummary", { seats: seatCount, shows: shows.length })} · {t("due")} :{" "}
            <span className="font-semibold tabular-nums">{dueLabel}</span>
          </span>
        </span>
        <Button size="sm" onClick={() => go(3)} disabled={!ready}>
          {t("viewCart")}
        </Button>
      </div>
    ) : null;

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
              <Button onClick={() => go(1)}>{t("next")}</Button>
            </StepFooter>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <h3 className="text-lg">{t("targetTitle")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t("targetHint")}</p>
            {cartBar}
            <ul className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {targets.map((s) => {
                const open = tariffsOf(s);
                const soldOut = open.every((x) => x.available === 0);
                const paid = open.filter((x) => x.priceCents > 0 && x.available > 0);
                const from = Math.min(...(paid.length > 0 ? paid : open).map((x) => x.priceCents));
                const show = shows.find((x) => x.target.sessionId === s.sessionId);
                const count = show?.lines.reduce((n, l) => n + l.quantity, 0) ?? 0;
                return (
                  <li key={s.sessionId} className="flex">
                    <button
                      type="button"
                      aria-pressed={count > 0}
                      disabled={soldOut && count === 0}
                      onClick={() => openShow(s.sessionId)}
                      className={cn(
                        eventCardClass,
                        "w-full text-left disabled:pointer-events-none disabled:opacity-60",
                        count > 0 && "border-primary ring-2 ring-primary",
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
                        badge={count > 0 ? t("inCart", { count }) : undefined}
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
              <Button onClick={() => go(3)} disabled={!ready}>
                {t("viewCart")}
              </Button>
            </StepFooter>
          </>
        ) : null}

        {step === 2 && target ? (
          <>
            <ChosenShow target={target} />
            {target.seated ? (
              <div className="mt-6">
                <ExchangeSeatPicker
                  key={target.sessionId}
                  sessionId={target.sessionId}
                  locale={locale}
                  tariffs={tariffs}
                  picks={entry.picks}
                  onPicks={(next) => updateEntry(target.sessionId, { picks: next })}
                  ownSeats={ownSeats}
                  price={price}
                />
              </div>
            ) : (
              <>
                <h3 className="mt-6 text-lg">{t("seatsTitle")}</h3>
                <ul className="mt-3 divide-y divide-border rounded-control border border-border">
                  {tariffs.map((tariff) => {
                    const n = entry.qty[tariff.id] ?? 0;
                    const max = roomOf(tariff.id, entry.qty);
                    const soldOut = Math.min(tariff.available, tariff.maxPerOrder) === 0;
                    const set = (value: number) => setQuantity(tariff.id, Math.min(max, value));
                    return (
                      <li key={tariff.id} className="flex items-center gap-3 px-3 py-3 text-sm">
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{tariff.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {tariff.priceCents > 0 ? price(tariff.priceCents) : t("freeTicket")}
                            {soldOut ? ` · ${t("soldOutTariff")}` : ""}
                            {tariff.requiresAttendee ? ` · ${t("namedTariff")}` : ""}
                          </span>
                          {tariff.maxPerPaidTicket != null && !soldOut && n >= max ? (
                            <span className="block text-xs text-muted-foreground">
                              {te(max === 0 ? "companionNeedsPaid" : "companionMaxReached")}
                            </span>
                          ) : null}
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
            {hereCheck && !hereCheck.ok ? (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {errorText(hereCheck.error)}
              </p>
            ) : null}
            <StepFooter>
              <Button variant="outline" onClick={() => go(1)}>
                <Plus className="size-4" />
                {t("otherShows")}
              </Button>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  {t("due")} :{" "}
                  <span className="font-semibold text-foreground tabular-nums">{dueLabel}</span>
                </span>
                <Button onClick={() => go(3)} disabled={!ready}>
                  {t("next")}
                </Button>
              </div>
            </StepFooter>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <h3 className="text-lg">{t("confirmTitle")}</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-card border border-border p-4">
                <p className="text-sm font-semibold">{t("youGive")}</p>
                {given.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">{t("nothingGiven")}</p>
                ) : null}
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
                <ul className="mt-2 divide-y divide-border">
                  {shows.map((show) => (
                    <li key={show.target.sessionId} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 text-sm">
                          <p>{show.target.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {show.target.when}
                            {show.target.venue ? ` · ${show.target.venue}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={t("edit")}
                            onClick={() => openShow(show.target.sessionId)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={t("remove")}
                            onClick={() => removeShow(show.target.sessionId)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                      <ShowLines show={show} price={price} freeLabel={t("freeTicket")} />
                    </li>
                  ))}
                </ul>
                <Button className="mt-3" variant="outline" size="sm" onClick={() => go(1)}>
                  <Plus className="size-4" />
                  {t("otherShows")}
                </Button>
              </div>
            </div>

            {slots.length > 0 ? (
              <div className="mt-4 rounded-card border border-border p-4">
                <p className="text-sm font-semibold">{tc("attendeesTitle")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{tc("attendeesHint")}</p>
                <div className="mt-4 space-y-4">
                  {slots.map((slot, i) => {
                    const value = attendeeOf(slot, i);
                    return (
                      <fieldset
                        key={slot.key}
                        className="grid gap-3 rounded-control border border-border p-3 sm:grid-cols-2"
                      >
                        <legend className="px-1 text-sm font-medium">{slot.legend}</legend>
                        <Field
                          label={tc("attendeeName")}
                          value={value.name}
                          autoComplete="off"
                          onChange={(name) => setAttendee(slot, i, { name })}
                        />
                        <Field
                          label={tc("attendeeBirthDate")}
                          type="date"
                          value={value.birthDate}
                          onChange={(birthDate) => setAttendee(slot, i, { birthDate })}
                          hint={
                            slot.maxAgeYears
                              ? tc("attendeeAgeHint", { age: slot.maxAgeYears })
                              : undefined
                          }
                        />
                      </fieldset>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="mt-5 space-y-1 text-sm">
              {given.length > 0 ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("givenValue")}</span>
                  <span className="tabular-nums">{price(quote.givenCents)}</span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("newValue")}</span>
                <span className="tabular-nums">{price(quote.newCents)}</span>
              </div>
              <div className="flex items-baseline justify-between pt-1">
                <span className="font-semibold">{t("due")}</span>
                <span className="text-xl font-extrabold tabular-nums">{dueLabel}</span>
              </div>
              {quote.newCents < quote.givenCents ? (
                <p className="text-xs text-muted-foreground">{t("noRefund")}</p>
              ) : null}
              {quote.dueCents > 0 && given.length > 0 ? (
                <p className="text-xs text-muted-foreground">{t("keepNote")}</p>
              ) : null}
            </div>

            {shows.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{t("errors.empty")}</p>
            ) : failing && !failing.check.ok ? (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {failing.show.target.title} : {errorText(failing.check.error)}
              </p>
            ) : !attendeesDone ? (
              <p className="mt-3 text-sm text-muted-foreground">{t("errors.attendeesMissing")}</p>
            ) : null}
            {state && !state.ok ? (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {errorText(state.error)}
              </p>
            ) : null}
            <StepFooter>
              <Button
                variant="outline"
                onClick={() => go(target ? 2 : 1)}
                disabled={pending}
              >
                <ArrowLeft className="size-4" />
                {t("back")}
              </Button>
              <Button onClick={confirm} disabled={pending || !ready || !attendeesDone}>
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

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input
        type={type}
        value={value}
        required
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 rounded-control border border-border bg-background px-3.5 text-sm outline-none focus:border-ring"
      />
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function ShowLines({
  show,
  price,
  freeLabel,
}: {
  show: CartShow;
  price: (cents: number) => string;
  freeLabel: string;
}) {
  const amount = (cents: number) => (cents > 0 ? price(cents) : freeLabel);
  return (
    <ul className="mt-2 space-y-1 text-sm">
      {show.target.seated
        ? show.lines.flatMap(({ tariff, seats }) =>
            seats.map((seat) => (
              <li key={seat.key} className="flex justify-between gap-3">
                <span className="min-w-0">
                  <span className="block">{seat.label}</span>
                  <span className="block text-xs text-muted-foreground">{tariff.name}</span>
                </span>
                <span className="shrink-0 tabular-nums">{amount(tariff.priceCents)}</span>
              </li>
            )),
          )
        : show.lines.map(({ tariff, quantity }) => (
            <li key={tariff.id} className="flex justify-between gap-3">
              <span>
                {quantity} × {tariff.name}
              </span>
              <span className="shrink-0 tabular-nums">{amount(tariff.priceCents * quantity)}</span>
            </li>
          ))}
    </ul>
  );
}

function ChosenShow({ target }: { target: ExchangerTarget }) {
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
    </div>
  );
}
