"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ZoomIn, ZoomOut } from "lucide-react";
import {
  readView,
  rowNumberMarks,
  seatLabel,
  viewLabel,
  type SeatLayout,
  type SeatZone,
} from "@/lib/seating/layout";
import { takenFill } from "@/lib/seating/contrast";
import { t } from "@/lib/types";

/** `blocked` : place réservée aux invités, affichée et cliquable dans l'admin. */
export type SeatState = "free" | "selected" | "taken" | "mine" | "off" | "blocked";

const ZOOMS = [1, 1.5, 2.25];
/** Texte d'état d'une place (titre et aria-label), hors place libre. */
const STATE_TEXT = {
  selected: "seatStateSelected",
  mine: "seatStateMine",
  taken: "seatTaken",
  off: "seatOff",
  blocked: "seatBlocked",
} as const;
/** Places libres quand toute la salle est au même prix : pas de catégories. */
const UNIFORM_FREE = "#CFC9F8";
/** Couleur d'une place libre dont la zone n'a pas de couleur. */
const FALLBACK_FREE = "#e5e7eb";
const INK = "#2A2C30";

/**
 * Salle au même prix partout : les couleurs ne servent plus qu'à montrer les
 * zones à visibilité réduite. Sans elles, une seule couleur.
 */
function keepsZoneColors(layout: SeatLayout, uniform: boolean): boolean {
  return !uniform || layout.zones.some((z) => readView(z.view));
}

/**
 * Libellé d'une zone : nom de la catégorie et visibilité réduite. Salle au
 * même prix : la visibilité seule, sans nom de catégorie.
 */
function zoneText(zone: SeatZone, locale: string, uniform: boolean): string | null {
  const view = viewLabel(readView(zone.view), locale);
  if (uniform) return view;
  return [t(zone.name, locale), view].filter(Boolean).join(" · ");
}

/**
 * Une place, dessinée à l'échelle `s` autour de (0, 0). Chaque état a un repère
 * qui ne dépend pas de la couleur : croix (occupée), contour pointillé (hors
 * tarif), double contour (sélectionnée), coche dans un coin (à vous).
 */
function SeatShape({
  state,
  s,
  fill,
  taken,
  number,
}: {
  state: SeatState;
  s: number;
  fill: string;
  taken: string;
  number?: string;
}) {
  const half = s / 2;
  const cross = s * 0.3;
  const mine = state === "mine";
  const selected = state === "selected";
  const isTaken = state === "taken";
  return (
    <>
      <rect
        x={-half}
        y={-half}
        width={s}
        height={s}
        rx={2.5}
        fill={mine ? "var(--background)" : isTaken ? taken : fill}
        opacity={state === "off" ? 0.45 : 1}
        stroke={
          selected ? "var(--foreground)" : mine ? "var(--primary)" : "rgba(42,44,48,0.35)"
        }
        strokeWidth={selected ? 2 : mine ? 1.8 : 0.6}
        strokeDasharray={state === "off" ? `${s * 0.15} ${s * 0.1}` : undefined}
      />
      {selected ? (
        <rect
          x={-half + 2}
          y={-half + 2}
          width={s - 4}
          height={s - 4}
          rx={1.5}
          fill="none"
          stroke="#fff"
          strokeWidth={0.9}
        />
      ) : null}
      {number != null ? (
        <text
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontSize: s * 0.5 }}
          fill={
            selected || state === "blocked" ? "#fff" : mine ? "var(--foreground)" : INK
          }
          opacity={isTaken ? 0.4 : 1}
          className="pointer-events-none font-semibold"
        >
          {number}
        </text>
      ) : null}
      {isTaken ? (
        <path
          d={`M${-cross} ${-cross}L${cross} ${cross}M${cross} ${-cross}L${-cross} ${cross}`}
          stroke={INK}
          strokeWidth={Math.max(1, s * 0.09)}
          strokeLinecap="round"
          opacity={0.75}
          className="pointer-events-none"
        />
      ) : null}
      {mine ? (
        <g className="pointer-events-none" transform={`translate(${half} ${-half})`}>
          <circle r={s * 0.24} fill="var(--primary)" stroke="var(--background)" strokeWidth={0.8} />
          <path
            d={`M${-s * 0.11} 0L${-s * 0.02} ${s * 0.09}L${s * 0.12} ${-s * 0.08}`}
            fill="none"
            stroke="#fff"
            strokeWidth={Math.max(0.9, s * 0.07)}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      ) : null}
    </>
  );
}

/** Couleurs de catégorie dont le gris des places occupées doit se distinguer. */
function categoryColors(layout: SeatLayout, uniform: boolean): string[] {
  const zones = layout.zones.map((z) => z.color);
  return keepsZoneColors(layout, uniform) && !uniform ? zones : [UNIFORM_FREE, ...zones];
}

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
  const tinted = keepsZoneColors(layout, uniform);
  const taken = takenFill(categoryColors(layout, uniform));
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
            const stateText = state === "free" ? null : te(STATE_TEXT[state]);
            const label = [
              seatLabel(layout, seat.key, locale, { view: false }),
              zone ? zoneText(zone, locale, uniform) : null,
              stateText,
            ]
              .filter(Boolean)
              .join(" · ");
            const fill =
              state === "selected"
                ? "var(--primary)"
                : state === "blocked"
                  ? INK
                  : tinted
                    ? (zone?.color ?? FALLBACK_FREE)
                    : UNIFORM_FREE;
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
                <SeatShape state={state} s={s} fill={fill} taken={taken} number={seat.number} />
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
  mineLabel,
  showOff,
}: {
  layout: SeatLayout;
  locale: string;
  zonePrices: Record<string, string>;
  /** Salle entière au même prix : une seule pastille « place libre ». */
  uniformPrice?: string;
  /** Places déjà à l'acheteur (état `mine`), quand le plan en montre. */
  mineLabel?: string;
  /** Le plan montre des places hors tarif (état `off`). */
  showOff?: boolean;
}) {
  const te = useTranslations("event");
  const swatch = "inline-block size-3.5 shrink-0 rounded-[3px] border border-black/20";
  const taken = takenFill(categoryColors(layout, uniformPrice != null));
  const legendSeat = (state: SeatState, fill: string) => (
    <svg viewBox="-9 -9 18 18" className="size-4 shrink-0 overflow-visible" aria-hidden>
      <SeatShape state={state} s={14} fill={fill} taken={taken} />
    </svg>
  );
  const hasFallback = layout.seats.some((seat) => !layout.zones.some((z) => z.key === seat.zone));
  const uniform = uniformPrice != null;
  const items: { key: string; colors: string[]; text: string; price?: string }[] = [];
  if (!uniform) {
    for (const z of layout.zones) {
      items.push({
        key: z.key,
        colors: [z.color],
        text: zoneText(z, locale, false) ?? "",
        price: zonePrices[z.key],
      });
    }
  } else if (!keepsZoneColors(layout, true)) {
    items.push({ key: "free", colors: [UNIFORM_FREE], text: te("seatFree"), price: uniformPrice });
  } else {
    // Une ligne par visibilité, avec les couleurs de toutes ses zones.
    for (const view of [undefined, "partial", "none"] as const) {
      const group = layout.zones.filter((z) => readView(z.view) === view);
      if (group.length === 0) continue;
      items.push({
        key: view ?? "free",
        colors: group.map((z) => z.color),
        text: viewLabel(view, locale) ?? te("seatViewNormal"),
        price: uniformPrice,
      });
    }
  }
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-2">
          <span className="flex shrink-0 gap-0.5">
            {item.colors.map((color) => (
              <span key={color} className={swatch} style={{ background: color }} />
            ))}
          </span>
          <span>
            {item.text}
            {item.price ? (
              <span className="text-muted-foreground"> · {item.price}</span>
            ) : null}
          </span>
        </li>
      ))}
      {hasFallback ? (
        <li className="flex items-center gap-2">
          {legendSeat("free", FALLBACK_FREE)}
          {te("seatFree")}
        </li>
      ) : null}
      <li className="flex items-center gap-2">
        {legendSeat("selected", "var(--primary)")}
        {te("seatSelected")}
      </li>
      {mineLabel ? (
        <li className="flex items-center gap-2">
          {legendSeat("mine", "var(--primary)")}
          {mineLabel}
        </li>
      ) : null}
      <li className="flex items-center gap-2">
        {legendSeat("taken", "")}
        {te("seatTaken")}
      </li>
      {showOff ? (
        <li className="flex items-center gap-2">
          {legendSeat("off", UNIFORM_FREE)}
          {te("seatOff")}
        </li>
      ) : null}
    </ul>
  );
}
