"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Loader2, ShoppingBag, X } from "lucide-react";
import { usePathname } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/cart/cart-context";
import { SeatLegend, SeatMap, type SeatState } from "@/components/seating/seat-map";
import { seatLabel, zoneAllowed, type SeatLayout } from "@/lib/seating/layout";
import { getSeatState } from "@/lib/seating/public-actions";
import { rememberShopOrigin } from "@/lib/shop-origin";
import { cn, formatDate, formatPrice } from "@/lib/utils";
import { t, type EventItem, type SessionItem, type TicketType } from "@/lib/types";
import { maxFor, type Counts } from "./ticket-limits";

interface Pick {
  key: string;
  ticketTypeId: string;
}

type Loaded = { layout: SeatLayout; unavailable: Set<string> };

const isCompanion = (tt: TicketType) => tt.maxPerPaidTicket != null;
const remaining = (tt: TicketType) => tt.quantity - tt.sold;

function countsOf(picks: Pick[]): Counts {
  const out: Counts = {};
  for (const p of picks) out[p.ticketTypeId] = (out[p.ticketTypeId] ?? 0) + 1;
  return out;
}

/**
 * Choix des places sur plan : chaque place reçoit le tarif de sa catégorie,
 * que l'acheteur peut remplacer par un tarif admis dans la zone (gratuité
 * jeune, par exemple), dans les limites de la séance.
 */
export function SeatedSelector({
  event,
  session,
  locale,
}: {
  event: EventItem;
  session: SessionItem;
  locale: string;
  embed?: boolean;
}) {
  const te = useTranslations("event");
  const { add, lines, previewOpen } = useCart();
  const pathname = usePathname();
  const [loaded, setLoaded] = React.useState<Loaded | "error" | null>(null);
  const [revision, setRevision] = React.useState(0);
  const [picks, setPicks] = React.useState<Pick[]>([]);
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    let ignore = false;
    getSeatState(session.id)
      .then((res) => {
        if (ignore) return;
        setLoaded(
          res ? { layout: res.layout, unavailable: new Set(res.unavailable) } : "error",
        );
      })
      .catch(() => {
        if (!ignore) setLoaded("error");
      });
    return () => {
      ignore = true;
    };
  }, [session.id, revision]);

  const layout = loaded && loaded !== "error" ? loaded.layout : null;
  const seatByKey = React.useMemo(
    () => new Map((layout?.seats ?? []).map((s) => [s.key, s])),
    [layout],
  );
  const tariffs = session.ticketTypes;
  const byId = new Map(tariffs.map((tt) => [tt.id, tt]));

  const allowedIn = (zone: string) =>
    tariffs.filter(
      (tt) => zoneAllowed(tt.seatZones ?? [], zone) && remaining(tt) > 0,
    );
  const defaultFor = (zone: string) =>
    allowedIn(zone).find((tt) => !isCompanion(tt));

  const inCart = new Set(
    lines.filter((l) => l.sessionId === session.id).flatMap((l) => l.seats ?? []),
  );

  /** Les gratuités au-delà de leur plafond reprennent le tarif de la place. */
  function normalize(list: Pick[]): Pick[] {
    const out = [...list];
    for (const tt of tariffs.filter(isCompanion)) {
      let counts = countsOf(out);
      while ((counts[tt.id] ?? 0) > maxFor(session, tt, counts)) {
        const idx = out.map((p) => p.ticketTypeId).lastIndexOf(tt.id);
        const seat = seatByKey.get(out[idx].key);
        const fallback = seat ? defaultFor(seat.zone) : undefined;
        if (fallback) out[idx] = { ...out[idx], ticketTypeId: fallback.id };
        else out.splice(idx, 1);
        counts = countsOf(out);
      }
    }
    return out;
  }

  function toggle(key: string) {
    setNotice(null);
    if (picks.some((p) => p.key === key)) {
      setPicks(normalize(picks.filter((p) => p.key !== key)));
      return;
    }
    const seat = seatByKey.get(key);
    const tt = seat ? defaultFor(seat.zone) : undefined;
    if (!tt) return;
    const counts = countsOf(picks);
    if ((counts[tt.id] ?? 0) >= maxFor(session, tt, counts)) {
      setNotice(te("seatLimit"));
      return;
    }
    setPicks([...picks, { key, ticketTypeId: tt.id }]);
  }

  function changeTariff(key: string, ticketTypeId: string) {
    setNotice(null);
    setPicks(
      normalize(picks.map((p) => (p.key === key ? { ...p, ticketTypeId } : p))),
    );
  }

  /** Le tarif est-il possible pour cette place, la sélection restant valide ? */
  function tariffFits(pick: Pick, tt: TicketType): boolean {
    if (tt.id === pick.ticketTypeId) return true;
    const counts = countsOf(picks);
    counts[pick.ticketTypeId] -= 1;
    counts[tt.id] = (counts[tt.id] ?? 0) + 1;
    return counts[tt.id] <= maxFor(session, tt, counts);
  }

  function stateOf(key: string): SeatState {
    if (picks.some((p) => p.key === key)) return "selected";
    if (inCart.has(key)) return "mine";
    if (loaded && loaded !== "error" && loaded.unavailable.has(key)) return "taken";
    const seat = seatByKey.get(key);
    return seat && defaultFor(seat.zone) ? "free" : "off";
  }

  function addToCart() {
    if (!layout) return;
    for (const tt of tariffs) {
      const keys = picks.filter((p) => p.ticketTypeId === tt.id).map((p) => p.key);
      if (keys.length === 0) continue;
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
          seats: keys,
          seatLabels: keys.map((k) => seatLabel(layout, k, locale)),
          requiresAttendee: tt.requiresAttendee,
          maxAgeYears: tt.maxAgeYears,
        },
        keys.length,
      );
    }
    rememberShopOrigin(pathname);
    setPicks([]);
    setRevision((n) => n + 1);
  }

  const price = (cents: number) =>
    cents === 0 ? te("free") : formatPrice(cents, `${locale}-CH`);
  const mainTariffs = tariffs.filter((tt) => !isCompanion(tt));
  const uniform = mainTariffs.every((tt) => (tt.seatZones ?? []).length === 0);
  const zonePrices: Record<string, string> = {};
  for (const zone of layout?.zones ?? []) {
    const tt = mainTariffs.find((x) => zoneAllowed(x.seatZones ?? [], zone.key));
    if (tt) zonePrices[zone.key] = price(tt.priceCents);
  }
  const totalCents = picks.reduce(
    (sum, p) => sum + (byId.get(p.ticketTypeId)?.priceCents ?? 0),
    0,
  );
  const companions = tariffs.filter(isCompanion);
  /** Gratuités proposées sur une place choisie : leur règle s'affiche sous l'option. */
  const offered = new Set(
    picks.flatMap((p) => {
      const seat = seatByKey.get(p.key);
      return seat && allowedIn(seat.zone).length > 1
        ? allowedIn(seat.zone).filter(isCompanion).map((tt) => tt.id)
        : [];
    }),
  );
  const companionInfo = (tt: TicketType) =>
    [
      tt.maxPerOrder <= (tt.maxPerPaidTicket ?? 0)
        ? te("companionRuleOrder", { n: tt.maxPerOrder })
        : te("companionRule", { n: tt.maxPerPaidTicket ?? 0 }),
      tt.requiresAttendee
        ? tt.maxAgeYears
          ? te("attendeeNoteAge", { age: tt.maxAgeYears })
          : te("attendeeNote")
        : null,
    ]
      .filter(Boolean)
      .join(" ");

  return (
    <div
      id="ticket-selector"
      className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          {layout ? (
            <SeatMap
              layout={layout}
              locale={locale}
              stateOf={stateOf}
              onToggle={toggle}
              uniform={uniform}
            />
          ) : (
            <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
              {loaded === "error" ? (
                te("seatError")
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  {te("seatLoading")}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col">
          <h3 className="text-xl font-semibold">{te("seatPickTitle")}</h3>
          <p className="mt-2 font-medium leading-snug">{t(event.title, locale)}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatDate(session.startsAt, `${locale}-CH`)}
            {session.label ? ` · ${t(session.label, locale)}` : null}
          </p>

          {layout ? (
            <div className="mt-4">
              <SeatLegend
                layout={layout}
                locale={locale}
                zonePrices={zonePrices}
                uniformPrice={
                  uniform && mainTariffs[0] ? price(mainTariffs[0].priceCents) : undefined
                }
              />
            </div>
          ) : null}

          <p className="mt-4 text-sm text-muted-foreground">{te("seatPickHint")}</p>

          <ul className="mt-3 space-y-2">
            {picks.map((pick) => {
              const seat = seatByKey.get(pick.key);
              const options = seat ? allowedIn(seat.zone) : [];
              return (
                <li
                  key={pick.key}
                  className="flex items-center gap-2 rounded-xl border border-border p-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {layout ? seatLabel(layout, pick.key, locale) : pick.key}
                    </p>
                    {options.length > 1 ? (
                      <fieldset className="mt-2 space-y-1.5">
                        <legend className="sr-only">{te("seatTariff")}</legend>
                        {options.map((tt) => {
                          const fits = tariffFits(pick, tt);
                          const checked = tt.id === pick.ticketTypeId;
                          const otherPaid = picks.some(
                            (p) =>
                              p.key !== pick.key &&
                              !isCompanion(byId.get(p.ticketTypeId)!) &&
                              byId.get(p.ticketTypeId)!.priceCents > 0,
                          );
                          return (
                            <label
                              key={tt.id}
                              className={cn(
                                "flex items-start gap-2.5 rounded-lg border px-2.5 py-2 text-sm transition-colors",
                                checked ? "border-primary bg-primary/5" : "border-border",
                                fits ? "cursor-pointer hover:bg-secondary/60" : "cursor-not-allowed",
                              )}
                            >
                              <input
                                type="radio"
                                name={`tariff-${pick.key}`}
                                value={tt.id}
                                checked={checked}
                                disabled={!fits}
                                onChange={() => changeTariff(pick.key, tt.id)}
                                className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
                              />
                              <span className="min-w-0">
                                <span className={cn("font-medium", !fits && "text-muted-foreground")}>
                                  {t(tt.name, locale)} · {price(tt.priceCents)}
                                </span>
                                {isCompanion(tt) ? (
                                  <span className="mt-0.5 block text-xs text-muted-foreground">
                                    {companionInfo(tt)}
                                    {fits
                                      ? null
                                      : ` ${te(otherPaid ? "companionMaxReached" : "companionNeedsPaid")}`}
                                  </span>
                                ) : null}
                              </span>
                            </label>
                          );
                        })}
                      </fieldset>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {byId.get(pick.ticketTypeId)
                          ? `${t(byId.get(pick.ticketTypeId)!.name, locale)} · ${price(byId.get(pick.ticketTypeId)!.priceCents)}`
                          : null}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggle(pick.key)}
                    aria-label={te("seatRemove")}
                    className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
          {picks.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">{te("seatNone")}</p>
          ) : null}

          {companions
            .filter((tt) => !offered.has(tt.id))
            .map((tt) => (
              <p key={tt.id} className="mt-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{t(tt.name, locale)}</span>
                {" — "}
                {companionInfo(tt)}
              </p>
            ))}

          {notice ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {notice}
            </p>
          ) : null}

          <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
            <span className="text-sm text-muted-foreground">{te("tickets")}</span>
            <span className="text-xl font-bold">
              {formatPrice(totalCents, `${locale}-CH`)}
            </span>
          </div>
          <Button
            className="mt-4 w-full"
            size="lg"
            disabled={picks.length === 0 || previewOpen}
            onClick={addToCart}
          >
            <ShoppingBag className="size-4" />
            {te("addToCart")}
          </Button>
        </div>
      </div>
    </div>
  );
}
