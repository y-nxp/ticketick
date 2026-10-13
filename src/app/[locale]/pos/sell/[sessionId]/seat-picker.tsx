"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Loader2, X } from "lucide-react";
import { SeatLegend, SeatMap, type SeatState } from "@/components/seating/seat-map";
import { getPosSeatState } from "@/lib/resellers/actions";
import { seatLabel, zoneAllowed, type SeatLayout } from "@/lib/seating/layout";

export interface SeatPick {
  key: string;
  ticketTypeId: string;
}

export interface PickerRow {
  id: string;
  name: string;
  price: string;
  available: number;
  companion: boolean;
  zones: string[];
}

type Loaded = { layout: SeatLayout; unavailable: Set<string> };

const selectClass =
  "h-9 w-full rounded-control border border-border bg-background px-2 text-sm outline-none transition-colors focus:border-ring";

/**
 * Choix des places sur le plan au guichet : chaque place reçoit le premier
 * tarif de sa catégorie, que le vendeur peut changer. Les plafonds
 * (gratuités, stock) sont vérifiés à la vente.
 */
export function PosSeatPicker({
  sessionId,
  locale,
  rows,
  picks,
  onChange,
  refreshKey,
}: {
  sessionId: string;
  locale: string;
  rows: PickerRow[];
  picks: SeatPick[];
  onChange: (picks: SeatPick[]) => void;
  /** Change après un refus de la vente : le plan est relu. */
  refreshKey: unknown;
}) {
  const te = useTranslations("event");
  const [loaded, setLoaded] = React.useState<Loaded | "error" | null>(null);

  React.useEffect(() => {
    let ignore = false;
    getPosSeatState(sessionId)
      .then((res) => {
        if (!ignore) {
          setLoaded(res ? { layout: res.layout, unavailable: new Set(res.unavailable) } : "error");
        }
      })
      .catch(() => {
        if (!ignore) setLoaded("error");
      });
    return () => {
      ignore = true;
    };
  }, [sessionId, refreshKey]);

  const layout = loaded && loaded !== "error" ? loaded.layout : null;
  const seatByKey = React.useMemo(
    () => new Map((layout?.seats ?? []).map((s) => [s.key, s])),
    [layout],
  );
  const used = (id: string) => picks.filter((p) => p.ticketTypeId === id).length;
  const allowedIn = (zone: string) =>
    rows.filter((r) => zoneAllowed(r.zones, zone) && r.available > 0);
  const defaultFor = (zone: string) =>
    allowedIn(zone).find((r) => !r.companion && used(r.id) < r.available);

  function stateOf(key: string): SeatState {
    if (picks.some((p) => p.key === key)) return "selected";
    if (loaded && loaded !== "error" && loaded.unavailable.has(key)) return "taken";
    const seat = seatByKey.get(key);
    return seat && defaultFor(seat.zone) ? "free" : "off";
  }

  function toggle(key: string) {
    if (picks.some((p) => p.key === key)) {
      onChange(picks.filter((p) => p.key !== key));
      return;
    }
    const seat = seatByKey.get(key);
    const row = seat ? defaultFor(seat.zone) : undefined;
    if (row) onChange([...picks, { key, ticketTypeId: row.id }]);
  }

  const mainRows = rows.filter((r) => !r.companion);
  const uniform = mainRows.every((r) => r.zones.length === 0);
  const zonePrices: Record<string, string> = {};
  for (const zone of layout?.zones ?? []) {
    const row = mainRows.find((r) => zoneAllowed(r.zones, zone.key));
    if (row) zonePrices[zone.key] = row.price;
  }

  if (!layout) {
    return (
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
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        <SeatMap layout={layout} locale={locale} stateOf={stateOf} onToggle={toggle} uniform={uniform} />
      </div>
      <div className="space-y-3">
        <SeatLegend
          layout={layout}
          locale={locale}
          zonePrices={zonePrices}
          uniformPrice={uniform && mainRows[0] ? mainRows[0].price : undefined}
        />
        <p className="text-sm text-muted-foreground">{te("seatPickHint")}</p>
        {picks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{te("seatNone")}</p>
        ) : (
          <ul className="space-y-2">
            {picks.map((pick) => {
              const seat = seatByKey.get(pick.key);
              const options = seat ? allowedIn(seat.zone) : [];
              return (
                <li key={pick.key} className="flex items-center gap-2 rounded-control border border-border p-2.5">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="truncate text-sm font-medium">{seatLabel(layout, pick.key, locale)}</p>
                    <select
                      aria-label={te("seatTariff")}
                      value={pick.ticketTypeId}
                      onChange={(e) =>
                        onChange(
                          picks.map((p) => (p.key === pick.key ? { ...p, ticketTypeId: e.target.value } : p)),
                        )
                      }
                      className={selectClass}
                    >
                      {options.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.name} · {row.price}
                        </option>
                      ))}
                    </select>
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
        )}
      </div>
    </div>
  );
}
