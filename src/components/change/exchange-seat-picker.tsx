"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Loader2, X } from "lucide-react";
import { SeatLegend, SeatMap, type SeatState } from "@/components/seating/seat-map";
import { seatLabel, zoneAllowed, type SeatLayout } from "@/lib/seating/layout";
import { getSeatState } from "@/lib/seating/public-actions";
import type { BasketTariff } from "@/lib/orders/self-service-rules";
import { cn } from "@/lib/utils";

export type PickerTariff = BasketTariff & { name: string; seatZones: string[] };

export interface SeatPick {
  key: string;
  ticketTypeId: string;
  label: string;
}

type Loaded = { layout: SeatLayout; unavailable: Set<string> };

const isCompanion = (tariff: PickerTariff) => tariff.maxPerPaidTicket != null;

/**
 * Nouvelles places de l'échange, choisies sur le plan. Chaque place prend le
 * tarif de sa catégorie, que le client peut remplacer par un autre tarif admis
 * dans la zone. Les places rendues restent visibles, sans pouvoir être reprises.
 */
export function ExchangeSeatPicker({
  sessionId,
  locale,
  tariffs,
  picks,
  onPicks,
  ownSeats,
  price,
}: {
  sessionId: string;
  locale: string;
  tariffs: PickerTariff[];
  picks: SeatPick[];
  onPicks: (picks: SeatPick[]) => void;
  ownSeats: Set<string>;
  price: (cents: number) => string;
}) {
  const t = useTranslations("change.exchange");
  const te = useTranslations("event");
  const [loaded, setLoaded] = React.useState<Loaded | "error" | null>(null);
  const [notice, setNotice] = React.useState(false);

  React.useEffect(() => {
    let ignore = false;
    getSeatState(sessionId)
      .then((res) => {
        if (ignore) return;
        setLoaded(res ? { layout: res.layout, unavailable: new Set(res.unavailable) } : "error");
      })
      .catch(() => {
        if (!ignore) setLoaded("error");
      });
    return () => {
      ignore = true;
    };
  }, [sessionId]);

  const layout = loaded && loaded !== "error" ? loaded.layout : null;
  const taken = loaded && loaded !== "error" ? loaded.unavailable : null;
  const zoneOf = React.useMemo(
    () => new Map((layout?.seats ?? []).map((s) => [s.key, s.zone])),
    [layout],
  );

  const countOf = (list: SeatPick[], id: string) => list.filter((p) => p.ticketTypeId === id).length;
  const fits = (tariff: PickerTariff, list: SeatPick[]) => {
    const n = countOf(list, tariff.id) + 1;
    return n <= tariff.available && n <= tariff.maxPerOrder;
  };
  const allowedIn = (zone: string) => tariffs.filter((x) => zoneAllowed(x.seatZones, zone));
  const defaultFor = (zone: string, list: SeatPick[]) => {
    const open = allowedIn(zone).filter((x) => !isCompanion(x) && fits(x, list));
    return open.find((x) => !x.requiresAttendee) ?? open[0];
  };

  function stateOf(key: string): SeatState {
    if (picks.some((p) => p.key === key)) return "selected";
    if (ownSeats.has(key)) return "mine";
    if (taken?.has(key)) return "taken";
    const zone = zoneOf.get(key);
    return zone != null && defaultFor(zone, picks) ? "free" : "off";
  }

  function toggle(key: string) {
    setNotice(false);
    if (picks.some((p) => p.key === key)) {
      onPicks(picks.filter((p) => p.key !== key));
      return;
    }
    const zone = zoneOf.get(key);
    if (!layout || zone == null || ownSeats.has(key) || taken?.has(key)) return;
    const tariff = defaultFor(zone, picks);
    if (!tariff) {
      if (allowedIn(zone).length > 0) setNotice(true);
      return;
    }
    onPicks([...picks, { key, ticketTypeId: tariff.id, label: seatLabel(layout, key, locale) }]);
  }

  function changeTariff(key: string, ticketTypeId: string) {
    onPicks(picks.map((p) => (p.key === key ? { ...p, ticketTypeId } : p)));
  }

  const mains = tariffs.filter((x) => !isCompanion(x));
  const uniform = mains.every((x) => x.seatZones.length === 0);
  const zonePrices: Record<string, string> = {};
  for (const zone of layout?.zones ?? []) {
    const tariff = mains.find((x) => zoneAllowed(x.seatZones, zone.key));
    if (tariff) zonePrices[zone.key] = price(tariff.priceCents);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-3">
        {layout ? (
          <>
            <SeatMap
              layout={layout}
              locale={locale}
              stateOf={stateOf}
              onToggle={toggle}
              uniform={uniform}
            />
            <SeatLegend
              layout={layout}
              locale={locale}
              zonePrices={zonePrices}
              uniformPrice={uniform && mains[0] ? price(mains[0].priceCents) : undefined}
              mineLabel={ownSeats.size > 0 ? t("currentSeats") : undefined}
            />
          </>
        ) : (
          <div className="grid min-h-64 place-items-center rounded-control border border-dashed border-border text-sm text-muted-foreground">
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

      <div>
        <h3 className="text-lg">{te("seatPickTitle")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{te("seatPickHint")}</p>
        <ul className="mt-3 space-y-2">
          {picks.map((pick) => {
            const options = allowedIn(zoneOf.get(pick.key) ?? "");
            const others = picks.filter((p) => p.key !== pick.key);
            const current = tariffs.find((x) => x.id === pick.ticketTypeId);
            return (
              <li key={pick.key} className="flex items-start gap-2 rounded-control border border-border p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{pick.label}</p>
                  {options.length > 1 ? (
                    <fieldset className="mt-2 space-y-1.5">
                      <legend className="sr-only">{te("seatTariff")}</legend>
                      {options.map((tariff) => {
                        const checked = tariff.id === pick.ticketTypeId;
                        const ok = checked || fits(tariff, others);
                        return (
                          <label
                            key={tariff.id}
                            className={cn(
                              "flex items-start gap-2.5 rounded-lg border px-2.5 py-2 text-sm transition-colors",
                              checked ? "border-primary bg-primary/5" : "border-border",
                              ok ? "cursor-pointer hover:bg-secondary/60" : "cursor-not-allowed",
                            )}
                          >
                            <input
                              type="radio"
                              name={`tariff-${pick.key}`}
                              value={tariff.id}
                              checked={checked}
                              disabled={!ok}
                              onChange={() => changeTariff(pick.key, tariff.id)}
                              className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
                            />
                            <span className={cn("min-w-0 font-medium", !ok && "text-muted-foreground")}>
                              {tariff.name} · {tariff.priceCents > 0 ? price(tariff.priceCents) : t("freeTicket")}
                              {tariff.requiresAttendee ? (
                                <span className="block text-xs font-normal text-muted-foreground">
                                  {t("namedTariff")}
                                </span>
                              ) : null}
                            </span>
                          </label>
                        );
                      })}
                    </fieldset>
                  ) : current ? (
                    <p className="text-xs text-muted-foreground">
                      {current.name} · {current.priceCents > 0 ? price(current.priceCents) : t("freeTicket")}
                    </p>
                  ) : null}
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
        {notice ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {te("seatLimit")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
