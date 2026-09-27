import type { Translated } from "@/lib/types";
import type { SeatLayout } from "./layout";
import { seatKey, type DraftSeat, type PlanDraft } from "./detect";

/**
 * Brouillon de plan relevé automatiquement, puis corrigé dans l'éditeur :
 * contrôles avant enregistrement, numérotation par blocs, conversion au
 * format `SeatLayout` des plans publiés.
 */

/** Côté d'une place dans les plans publiés (unités du `viewBox`). */
const SEAT_SIZE = 12;

export interface DraftIssues {
  noSection: number;
  noRow: number;
  noNumber: number;
  /** Identifiants des places qui portent la même référence qu'une autre. */
  duplicates: Set<string>;
  total: number;
}

export function isIncomplete(seat: DraftSeat): boolean {
  return !seat.section || !seat.row || !seat.number;
}

export function draftIssues(draft: PlanDraft): DraftIssues {
  const byKey = new Map<string, string[]>();
  let noSection = 0;
  let noRow = 0;
  let noNumber = 0;
  for (const s of draft.seats) {
    if (!s.section) noSection++;
    if (!s.row) noRow++;
    if (!s.number) noNumber++;
    if (isIncomplete(s)) continue;
    const key = seatKey(s);
    byKey.set(key, [...(byKey.get(key) ?? []), s.id]);
  }
  const duplicates = new Set([...byKey.values()].filter((ids) => ids.length > 1).flat());
  return {
    noSection,
    noRow,
    noNumber,
    duplicates,
    total: draft.seats.filter(isIncomplete).length + duplicates.size,
  };
}

function translated(text: string): Translated {
  return { fr: text, en: text, de: text, it: text };
}

const round = (v: number) => Math.round(v * 10) / 10;

export function draftToLayout(draft: PlanDraft): SeatLayout {
  const k = SEAT_SIZE / draft.seatSize;
  const usedSections = new Set(draft.seats.map((s) => s.section));
  const usedZones = new Set(draft.seats.map((s) => s.zone));
  const seats = draft.seats.map((s) => ({
    key: seatKey(s),
    section: s.section!,
    row: s.row!,
    number: s.number!,
    zone: s.zone,
    x: round(s.x * k),
    y: round(s.y * k),
    ...(s.rotate ? { rotate: s.rotate } : {}),
  }));
  const marks = draft.marks.map((m) => ({
    text: translated(m.text),
    x: round(m.x * k),
    y: round(m.y * k),
    size: Math.max(6, Math.round(m.size * k * 0.8)),
  }));

  const xs = [...seats.map((s) => s.x), ...marks.map((m) => m.x)];
  const ys = [...seats.map((s) => s.y), ...marks.map((m) => m.y)];
  const margin = 2 * SEAT_SIZE;
  const minX = Math.floor(Math.min(...xs) - margin);
  const minY = Math.floor(Math.min(...ys) - margin);

  return {
    viewBox: {
      x: minX,
      y: minY,
      w: Math.ceil(Math.max(...xs) + margin - minX),
      h: Math.ceil(Math.max(...ys) + margin - minY),
    },
    seatSize: SEAT_SIZE,
    zones: draft.zones
      .filter((z) => usedZones.has(z.key))
      .map((z) => ({ key: z.key, name: translated(z.name), color: z.color })),
    sections: draft.sections
      .filter((s) => usedSections.has(s.key))
      .map((s) => ({ key: s.key, name: translated(s.name) })),
    seats,
    marks,
    areas: [],
  };
}

export type Orientation = "horizontal" | "vertical";

export interface NumberingOptions {
  orientation: Orientation;
  firstRow: string;
  /** Rangs de haut en bas (ou de gauche à droite) si vrai. */
  rowsForward: boolean;
  firstSeat: number;
  /** Places de gauche à droite (ou de haut en bas) si vrai. */
  seatsForward: boolean;
}

/** Rang suivant : 1 → 2, A → B, Z → AA. */
export function nextRow(label: string, step: number): string {
  if (/^\d+$/.test(label)) return String(Number(label) + step);
  if (/^[A-Z]+$/i.test(label)) {
    let n = 0;
    for (const c of label.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
    n += step;
    let out = "";
    while (n > 0) {
      const r = (n - 1) % 26;
      out = String.fromCharCode(65 + r) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out || "A";
  }
  return step === 0 ? label : `${label}${step + 1}`;
}

/** Axe d'un groupe de places, orienté de gauche à droite (ou de haut en bas). */
function axisOf(seats: DraftSeat[], fallback: Orientation): [number, number] {
  if (seats.length < 2) return fallback === "horizontal" ? [1, 0] : [0, 1];
  const mx = seats.reduce((s, p) => s + p.x, 0) / seats.length;
  const my = seats.reduce((s, p) => s + p.y, 0) / seats.length;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const p of seats) {
    xx += (p.x - mx) ** 2;
    yy += (p.y - my) ** 2;
    xy += (p.x - mx) * (p.y - my);
  }
  const a = 0.5 * Math.atan2(2 * xy, xx - yy);
  let ux = Math.cos(a);
  let uy = Math.sin(a);
  if (Math.abs(ux) >= Math.abs(uy) ? ux < 0 : uy < 0) {
    ux = -ux;
    uy = -uy;
  }
  return [ux, uy];
}

/**
 * Numérote les places de la sélection rang par rang, en gardant les rangs
 * déjà attribués. Les places sans rang forment un seul rang.
 */
export function numberSeats(
  seats: DraftSeat[],
  selected: Set<string>,
  firstSeat: number,
  forward: boolean,
  orientation: Orientation,
): DraftSeat[] {
  const groups = new Map<string, DraftSeat[]>();
  for (const s of seats) {
    if (!selected.has(s.id)) continue;
    const key = `${s.section ?? ""}|${s.row ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const numbers = new Map<string, string>();
  for (const group of groups.values()) {
    const [ux, uy] = axisOf(group, orientation);
    const sorted = [...group].sort((a, b) => (a.x - b.x) * ux + (a.y - b.y) * uy);
    if (!forward) sorted.reverse();
    sorted.forEach((s, i) => numbers.set(s.id, String(firstSeat + i)));
  }
  return seats.map((s) => (numbers.has(s.id) ? { ...s, number: numbers.get(s.id)! } : s));
}

/**
 * Découpe la sélection en rangs (lignes ou colonnes de places), les nomme à
 * la suite à partir du premier rang, puis numérote les places de chacun.
 */
export function numberRowsAndSeats(
  seats: DraftSeat[],
  selected: Set<string>,
  seatSize: number,
  options: NumberingOptions,
): DraftSeat[] {
  const picked = seats.filter((s) => selected.has(s.id));
  const across = (s: DraftSeat) => (options.orientation === "horizontal" ? s.y : s.x);
  const sorted = [...picked].sort((a, b) => across(a) - across(b));
  const lines: DraftSeat[][] = [];
  for (const s of sorted) {
    const line = lines[lines.length - 1];
    const ref = line ? line.reduce((sum, p) => sum + across(p), 0) / line.length : NaN;
    if (line && Math.abs(across(s) - ref) < 0.5 * seatSize) line.push(s);
    else lines.push([s]);
  }
  if (!options.rowsForward) lines.reverse();

  const updates = new Map<string, Partial<DraftSeat>>();
  lines.forEach((line, i) => {
    const row = nextRow(options.firstRow, i);
    const along = (s: DraftSeat) => (options.orientation === "horizontal" ? s.x : s.y);
    const ordered = [...line].sort((a, b) => along(a) - along(b));
    if (!options.seatsForward) ordered.reverse();
    ordered.forEach((s, j) => updates.set(s.id, { row, number: String(options.firstSeat + j) }));
  });
  return seats.map((s) => (updates.has(s.id) ? { ...s, ...updates.get(s.id) } : s));
}
