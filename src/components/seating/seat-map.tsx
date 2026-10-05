"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ZoomIn, ZoomOut } from "lucide-react";
import { rowNumberMarks, seatLabel, type SeatLayout } from "@/lib/seating/layout";
import { t } from "@/lib/types";

/** `blocked` : place réservée aux invités, affichée et cliquable dans l'admin. */
export type SeatState = "free" | "selected" | "taken" | "mine" | "off" | "blocked";

const ZOOMS = [1, 1.5, 2.25];
/** Places libres quand toute la salle est au même prix : pas de catégories. */
const UNIFORM_FREE = "#CFC9F8";

/**
 * Plan de salle cliquable. Les couleurs de catégorie sont celles du plan
 * fourni par la salle ; les places prises ou hors tarif sont grisées.
 */
export function SeatMap({
  layout,
  locale,
  stateOf,
  onToggle,
  uniform = false,
}: {
  layout: SeatLayout;
  locale: string;
  stateOf: (key: string) => SeatState;
  onToggle: (key: string) => void;
  uniform?: boolean;
}) {
  const te = useTranslations("event");
  const [zoom, setZoom] = React.useState(0);
  const { viewBox: vb, seatSize: s } = layout;
  const zones = new Map(layout.zones.map((z) => [z.key, z]));
  const rows = React.useMemo(
    () => (layout.rowNumbers ? rowNumberMarks(layout) : []),
    [layout],
  );

  return (
    <div className="relative">
      <div className="absolute right-2 top-2 z-10 flex gap-1">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0, z - 1))}
          disabled={zoom === 0}
          aria-label={te("zoomOut")}
          className="grid size-9 place-items-center rounded-full border border-border bg-background shadow-sm hover:bg-secondary disabled:opacity-40"
        >
          <ZoomOut className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}
          disabled={zoom === ZOOMS.length - 1}
          aria-label={te("zoomIn")}
          className="grid size-9 place-items-center rounded-full border border-border bg-background shadow-sm hover:bg-secondary disabled:opacity-40"
        >
          <ZoomIn className="size-4" />
        </button>
      </div>
      <div className="max-h-[75vh] overflow-auto rounded-control border border-border bg-background">
        <svg
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          style={{ width: `${ZOOMS[zoom] * 100}%` }}
          className="mx-auto block h-auto max-w-none select-none"
          role="group"
          aria-label={te("seatPickTitle")}
        >
          {layout.areas.map((a, i) => (
            <g key={`area-${i}`}>
              <rect
                x={a.x}
                y={a.y}
                width={a.w}
                height={a.h}
                rx={10}
                className="fill-muted stroke-border"
              />
              {a.label ? (
                <text
                  x={a.x + a.w / 2}
                  y={a.y + a.h / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-muted-foreground text-[16px] font-semibold uppercase"
                >
                  {t(a.label, locale)}
                </text>
              ) : null}
            </g>
          ))}
          {layout.marks.map((m, i) => (
            <text
              key={`mark-${i}`}
              x={m.x}
              y={m.y}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fontSize: m.size ?? 12 }}
              className="fill-muted-foreground font-semibold uppercase"
            >
              {t(m.text, locale)}
            </text>
          ))}
          {rows.map((r, i) => (
            <text
              key={`row-${i}`}
              x={r.x}
              y={r.y}
              textAnchor="middle"
              dominantBaseline="central"
              style={{ fontSize: s * 0.6 }}
              className="pointer-events-none fill-muted-foreground font-medium"
              aria-hidden
            >
              {r.text}
            </text>
          ))}
          {layout.seats.map((seat) => {
            const state = stateOf(seat.key);
            const zone = zones.get(seat.zone);
            const clickable =
              state === "free" || state === "selected" || state === "blocked";
            const label = `${seatLabel(layout, seat.key, locale)}${zone && !uniform ? ` · ${t(zone.name, locale)}` : ""}`;
            const fill =
              state === "selected" || state === "mine"
                ? "var(--primary)"
                : state === "blocked"
                  ? "#2A2C30"
                  : state === "free"
                  ? uniform
                    ? UNIFORM_FREE
                    : (zone?.color ?? "#e5e7eb")
                  : "#d4d4d8";
            return (
              <g
                key={seat.key}
                transform={`translate(${seat.x} ${seat.y})${seat.rotate ? ` rotate(${seat.rotate})` : ""}`}
                role={clickable ? "button" : "img"}
                tabIndex={clickable ? 0 : -1}
                aria-label={label}
                aria-pressed={clickable ? state === "selected" : undefined}
                aria-disabled={clickable ? undefined : true}
                onClick={clickable ? () => onToggle(seat.key) : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onToggle(seat.key);
                        }
                      }
                    : undefined
                }
                className={clickable ? "cursor-pointer outline-none [&:focus-visible>rect]:stroke-[var(--foreground)] [&:focus-visible>rect]:stroke-2" : undefined}
              >
                <title>{label}</title>
                <rect
                  x={-s / 2}
                  y={-s / 2}
                  width={s}
                  height={s}
                  rx={2.5}
                  fill={fill}
                  opacity={state === "mine" ? 0.4 : state === "off" ? 0.45 : 1}
                  stroke={state === "selected" ? "var(--foreground)" : "rgba(42,44,48,0.35)"}
                  strokeWidth={state === "selected" ? 1.5 : 0.6}
                />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{ fontSize: s * 0.5 }}
                  fill={
                    state === "selected" || state === "mine" || state === "blocked"
                      ? "#fff"
                      : "#2A2C30"
                  }
                  className="pointer-events-none font-semibold"
                >
                  {seat.number}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function SeatLegend({
  layout,
  locale,
  zonePrices,
  uniformPrice,
}: {
  layout: SeatLayout;
  locale: string;
  zonePrices: Record<string, string>;
  /** Salle entière au même prix : une seule pastille « place libre ». */
  uniformPrice?: string;
}) {
  const te = useTranslations("event");
  const swatch = "inline-block size-3.5 shrink-0 rounded-[3px] border border-black/20";
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
      {uniformPrice != null ? (
        <li className="flex items-center gap-2">
          <span className={swatch} style={{ background: UNIFORM_FREE }} />
          <span>
            {te("seatFree")}
            {uniformPrice ? (
              <span className="text-muted-foreground"> · {uniformPrice}</span>
            ) : null}
          </span>
        </li>
      ) : null}
      {(uniformPrice != null ? [] : layout.zones).map((z) => (
        <li key={z.key} className="flex items-center gap-2">
          <span className={swatch} style={{ background: z.color }} />
          <span>
            {t(z.name, locale)}
            {zonePrices[z.key] ? (
              <span className="text-muted-foreground"> · {zonePrices[z.key]}</span>
            ) : null}
          </span>
        </li>
      ))}
      <li className="flex items-center gap-2">
        <span className={swatch} style={{ background: "var(--primary)" }} />
        {te("seatSelected")}
      </li>
      <li className="flex items-center gap-2">
        <span className={swatch} style={{ background: "#d4d4d8" }} />
        {te("seatTaken")}
      </li>
    </ul>
  );
}
