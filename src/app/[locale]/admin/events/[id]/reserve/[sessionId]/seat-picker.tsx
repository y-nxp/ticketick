"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { SeatLegend, SeatMap, type SeatState } from "@/components/seating/seat-map";
import { seatLabel, zoneAllowed, type SeatLayout } from "@/lib/seating/layout";

export interface SeatPick {
  key: string;
  ticketTypeId: string;
}

export interface PickerRow {
  id: string;
  name: string;
  price: string;
  zones: string[];
}

export interface PickerSeat {
  key: string;
  zone: string;
  status: "AVAILABLE" | "RESERVED" | "BLOCKED";
}

const selectClass =
  "h-9 w-full rounded-control border border-border bg-background px-2 text-sm outline-none transition-colors focus:border-ring";

/**
 * Choix des places d'une réservation sur le plan. Les places libres comme les
 * places bloquées pour les invités se prennent : l'admin voit la couleur
 * avant de cliquer. Chaque place reçoit le premier tarif de sa catégorie,
 * modifiable ensuite.
 */
export function ReservationSeatPicker({
  layout,
  locale,
  seats,
  rows,
  picks,
  onChange,
}: {
  layout: SeatLayout;
  locale: string;
  seats: PickerSeat[];
  rows: PickerRow[];
  picks: SeatPick[];
  onChange: (picks: SeatPick[]) => void;
}) {
  const te = useTranslations("event");
  const ts = useTranslations("admin.seats");
  const byKey = React.useMemo(() => new Map(seats.map((s) => [s.key, s])), [seats]);
  const allowedIn = (zone: string) => rows.filter((r) => zoneAllowed(r.zones, zone));

  function stateOf(key: string): SeatState {
    if (picks.some((p) => p.key === key)) return "selected";
    const seat = byKey.get(key);
    if (!seat || seat.status === "RESERVED") return seat ? "taken" : "off";
    if (allowedIn(seat.zone).length === 0) return "off";
    return seat.status === "BLOCKED" ? "blocked" : "free";
  }

  function toggle(key: string) {
    if (picks.some((p) => p.key === key)) {
      onChange(picks.filter((p) => p.key !== key));
      return;
    }
    const seat = byKey.get(key);
    const row = seat ? allowedIn(seat.zone)[0] : undefined;
    if (row) onChange([...picks, { key, ticketTypeId: row.id }]);
  }

  const uniform = rows.every((r) => r.zones.length === 0);
  const zonePrices: Record<string, string> = {};
  for (const zone of layout.zones) {
    const row = rows.find((r) => zoneAllowed(r.zones, zone.key));
    if (row) zonePrices[zone.key] = row.price;
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
          uniformPrice={uniform && rows[0] ? rows[0].price : undefined}
        />
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <li className="flex items-center gap-2">
            <span className="inline-block size-3.5 shrink-0 rounded-[3px] border border-black/20 bg-[#2A2C30]" />
            {ts("legendBlocked")}
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">{te("seatPickHint")}</p>
        {picks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{te("seatNone")}</p>
        ) : (
          <ul className="space-y-2">
            {picks.map((pick) => {
              const seat = byKey.get(pick.key);
              const options = seat ? allowedIn(seat.zone) : [];
              return (
                <li key={pick.key} className="flex items-center gap-2 rounded-control border border-border p-2.5">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="truncate text-sm font-medium">
                      {seatLabel(layout, pick.key, locale)}
                      {seat?.status === "BLOCKED" ? (
                        <span className="ml-1.5 rounded-full bg-[#2A2C30] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
                          {ts("blocked")}
                        </span>
                      ) : null}
                    </p>
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
