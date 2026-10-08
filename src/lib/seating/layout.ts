import { t, type Translated } from "@/lib/types";

/**
 * Plan de salle numéroté.
 *
 * Stocké en JSON sur `SeatPlan.layout` et partagé par toutes les séances du
 * lieu. Les coordonnées sont celles du dessin (unités libres) : le composant
 * les met à l'échelle via `viewBox`.
 */

/** Vue réduite ou nulle sur la scène. Absente : bonne visibilité, rien à signaler. */
export const SEAT_VIEWS = ["partial", "none"] as const;

export type SeatView = (typeof SEAT_VIEWS)[number];

export interface SeatZone {
  key: string;
  name: Translated;
  /** Couleur de la catégorie, reprise du plan fourni par la salle. */
  color: string;
  /** Annoncée sur le plan, à l'achat et sur le billet. */
  view?: SeatView;
}

export interface SeatSection {
  key: string;
  name: Translated;
}

export interface SeatDef {
  /** Unique dans le plan : `NEF-5-9`. */
  key: string;
  section: string;
  row: string;
  number: string;
  zone: string;
  x: number;
  y: number;
  /** Inclinaison en degrés (bancs en biais). */
  rotate?: number;
}

export interface SeatMark {
  text: Translated;
  x: number;
  y: number;
  size?: number;
}

export interface SeatArea {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: Translated;
}

export interface SeatLayout {
  viewBox: { x: number; y: number; w: number; h: number };
  seatSize: number;
  zones: SeatZone[];
  sections: SeatSection[];
  seats: SeatDef[];
  marks: SeatMark[];
  areas: SeatArea[];
  /** Affiche le numéro de rang au bout de chaque rang. */
  rowNumbers?: boolean;
}

const WORDS: Record<string, { row: string; seat: string }> = {
  fr: { row: "Rang", seat: "Place" },
  en: { row: "Row", seat: "Seat" },
  de: { row: "Reihe", seat: "Platz" },
  it: { row: "Fila", seat: "Posto" },
  es: { row: "Fila", seat: "Asiento" },
};

const VIEW_WORDS: Record<string, Record<SeatView, string>> = {
  fr: { partial: "Visibilité partielle", none: "Sans visibilité" },
  en: { partial: "Restricted view", none: "No view of the stage" },
  de: { partial: "Eingeschränkte Sicht", none: "Keine Sicht auf die Bühne" },
  it: { partial: "Visibilità parziale", none: "Senza visibilità" },
  es: { partial: "Visibilidad parcial", none: "Sin visibilidad" },
};

function tr(value: Translated, locale: string): string {
  return t(value, locale);
}

/** Écrit côté serveur aussi (billets, courriels) : pas de messages next-intl ici. */
export function viewLabel(view: SeatView | undefined, locale: string): string | null {
  if (!view) return null;
  return (VIEW_WORDS[locale] ?? VIEW_WORDS.fr)[view] ?? null;
}

/** Sépare d'un libellé de `seatLabel` la mention de visibilité finale. */
export function splitSeatView(label: string): { place: string; view?: string } {
  const parts = label.split(" · ");
  const last = parts.at(-1);
  const views = Object.values(VIEW_WORDS).flatMap((w) => Object.values(w));
  if (parts.length > 1 && last && views.includes(last)) {
    return { place: parts.slice(0, -1).join(" · "), view: last };
  }
  return { place: label };
}

export function readView(value: unknown): SeatView | undefined {
  return SEAT_VIEWS.includes(value as SeatView) ? (value as SeatView) : undefined;
}

/**
 * Libellé imprimé sur le billet : « Nef · Rang 5 · Place 9 », suivi de la
 * visibilité quand elle est réduite.
 */
export function seatLabel(
  layout: SeatLayout,
  key: string,
  locale: string,
  { view = true }: { view?: boolean } = {},
): string {
  const seat = layout.seats.find((s) => s.key === key);
  if (!seat) return key;
  const section = layout.sections.find((s) => s.key === seat.section);
  const zone = view ? layout.zones.find((z) => z.key === seat.zone) : undefined;
  const w = WORDS[locale] ?? WORDS.fr;
  return [
    section ? tr(section.name, locale) : null,
    `${w.row} ${seat.row}`,
    `${w.seat} ${seat.number}`,
    viewLabel(readView(zone?.view), locale),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function readLayout(value: unknown): SeatLayout | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<SeatLayout>;
  if (!Array.isArray(v.seats) || !Array.isArray(v.zones) || !v.viewBox) {
    return null;
  }
  return {
    viewBox: v.viewBox,
    seatSize: v.seatSize ?? 12,
    zones: v.zones,
    sections: v.sections ?? [],
    seats: v.seats,
    marks: v.marks ?? [],
    areas: v.areas ?? [],
    rowNumbers: v.rowNumbers === true,
  };
}

/**
 * Numéros de rang placés dans le prolongement de chaque rang, aux deux bouts.
 * Un numéro qui tomberait sur une place ou sur un autre numéro est omis.
 */
type RowSeat = Pick<SeatDef, "section" | "row" | "number" | "x" | "y">;

export function rowNumberMarks(
  layout: { seatSize: number; seats: RowSeat[] },
): { text: string; x: number; y: number }[] {
  const s = layout.seatSize;
  const rows = new Map<string, RowSeat[]>();
  for (const seat of layout.seats) {
    const k = `${seat.section}\u0000${seat.row}`;
    rows.set(k, [...(rows.get(k) ?? []), seat]);
  }
  const out: { text: string; x: number; y: number }[] = [];
  const near = (x: number, y: number, px: number, py: number, d: number) =>
    Math.hypot(x - px, y - py) < d;
  for (const seats of rows.values()) {
    if (seats.length < 2) continue;
    seats.sort((a, b) => Number(a.number) - Number(b.number) || a.number.localeCompare(b.number));
    const a = seats[0]!;
    const b = seats[seats.length - 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!len) continue;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const gap = s * 1.3;
    for (const [x, y] of [
      [a.x - ux * gap, a.y - uy * gap],
      [b.x + ux * gap, b.y + uy * gap],
    ] as const) {
      if (layout.seats.some((o) => near(x, y, o.x, o.y, s * 1.05))) continue;
      if (out.some((o) => near(x, y, o.x, o.y, s * 1.3))) continue;
      out.push({ text: a.row, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
    }
  }
  return out;
}

/** Zones où un tarif se vend : toutes si la liste est vide. */
export function zoneAllowed(seatZones: string[], zone: string): boolean {
  return seatZones.length === 0 || seatZones.includes(zone);
}
