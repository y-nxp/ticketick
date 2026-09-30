import { t, type Translated } from "@/lib/types";

/**
 * Plan de salle numéroté.
 *
 * Stocké en JSON sur `SeatPlan.layout` et partagé par toutes les séances du
 * lieu. Les coordonnées sont celles du dessin (unités libres) : le composant
 * les met à l'échelle via `viewBox`.
 */

export interface SeatZone {
  key: string;
  name: Translated;
  /** Couleur de la catégorie, reprise du plan fourni par la salle. */
  color: string;
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
}

const WORDS: Record<string, { row: string; seat: string }> = {
  fr: { row: "Rang", seat: "Place" },
  en: { row: "Row", seat: "Seat" },
  de: { row: "Reihe", seat: "Platz" },
  it: { row: "Fila", seat: "Posto" },
  es: { row: "Fila", seat: "Asiento" },
};

function tr(value: Translated, locale: string): string {
  return t(value, locale);
}

/** Libellé imprimé sur le billet : « Nef · Rang 5 · Place 9 ». */
export function seatLabel(
  layout: SeatLayout,
  key: string,
  locale: string,
): string {
  const seat = layout.seats.find((s) => s.key === key);
  if (!seat) return key;
  const section = layout.sections.find((s) => s.key === seat.section);
  const w = WORDS[locale] ?? WORDS.fr;
  return [
    section ? tr(section.name, locale) : null,
    `${w.row} ${seat.row}`,
    `${w.seat} ${seat.number}`,
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
  };
}

/** Zones où un tarif se vend : toutes si la liste est vide. */
export function zoneAllowed(seatZones: string[], zone: string): boolean {
  return seatZones.length === 0 || seatZones.includes(zone);
}
