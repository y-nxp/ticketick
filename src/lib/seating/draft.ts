import type { Translated } from "@/lib/types";
import type { SeatLayout } from "./layout";
import { seatKey, type DraftSeat, type PlanDraft } from "./detect";

/**
 * Brouillon de plan relevé automatiquement, ou plan publié rouvert, corrigé
 * dans l'éditeur : contrôles avant enregistrement, numérotation et
 * déplacements par blocs, conversion au format `SeatLayout` des plans publiés.
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

function translated(text: string, i18n?: Translated): Translated {
  if (i18n && i18n.fr === text) return i18n;
  return { fr: text, en: text, de: text, it: text };
}

const round = (v: number) => Math.round(v * 10) / 10;

/** Les marques relevées sur une image s'affichent un peu plus petites que la police du PDF. */
const MARK_SCALE = 0.8;

/**
 * Plan publié rouvert dans l'éditeur. Les places gardent leur référence comme
 * identifiant : le serveur reconnaît ainsi celles qui ont déjà été vendues.
 */
export function layoutToDraft(layout: SeatLayout): PlanDraft {
  const s = layout.seatSize;
  const pad = 6 * s;
  const ox = layout.viewBox.x - pad;
  const oy = layout.viewBox.y - pad;
  return {
    width: layout.viewBox.w + 2 * pad,
    height: layout.viewBox.h + 2 * pad,
    seatSize: s,
    seats: layout.seats.map((seat) => ({
      id: seat.key,
      x: seat.x - ox,
      y: seat.y - oy,
      rotate: seat.rotate ?? 0,
      zone: seat.zone,
      section: seat.section,
      row: seat.row,
      number: seat.number,
    })),
    zones: layout.zones.map((z) => ({
      key: z.key,
      color: z.color,
      name: z.name.fr,
      declared: null,
      i18n: z.name,
    })),
    sections: layout.sections.map((sec) => ({ key: sec.key, name: sec.name.fr, i18n: sec.name })),
    marks: layout.marks.map((m) => ({
      text: m.text.fr,
      x: m.x - ox,
      y: m.y - oy,
      size: ((m.size ?? 12) * s) / SEAT_SIZE / MARK_SCALE,
      i18n: m.text,
    })),
    areas: layout.areas.map((a) => ({ ...a, x: a.x - ox, y: a.y - oy })),
    origin: { x: ox, y: oy },
    declaredTotal: null,
    rowNumbers: layout.rowNumbers,
  };
}

/**
 * `keepUnused` garde les catégories et zones vidées : sur un plan déjà en
 * vente, des tarifs peuvent s'y rattacher.
 */
export function draftToLayout(draft: PlanDraft, { keepUnused = false } = {}): SeatLayout {
  const k = SEAT_SIZE / draft.seatSize;
  const ox = draft.origin?.x ?? 0;
  const oy = draft.origin?.y ?? 0;
  const X = (x: number) => round((x + ox) * k);
  const Y = (y: number) => round((y + oy) * k);
  const usedSections = new Set(draft.seats.map((s) => s.section));
  const usedZones = new Set(draft.seats.map((s) => s.zone));
  const seats = draft.seats.map((s) => ({
    key: seatKey(s),
    section: s.section!,
    row: s.row!,
    number: s.number!,
    zone: s.zone,
    x: X(s.x),
    y: Y(s.y),
    ...(s.rotate ? { rotate: round(s.rotate) } : {}),
  }));
  const marks = draft.marks.map((m) => ({
    text: translated(m.text, m.i18n),
    x: X(m.x),
    y: Y(m.y),
    size: Math.max(6, Math.round(m.size * k * MARK_SCALE)),
  }));
  const areas = (draft.areas ?? []).map((a) => ({
    ...a,
    x: X(a.x),
    y: Y(a.y),
    w: round(a.w * k),
    h: round(a.h * k),
  }));

  const xs = [...seats.map((s) => s.x), ...marks.map((m) => m.x), ...areas.flatMap((a) => [a.x, a.x + a.w])];
  const ys = [...seats.map((s) => s.y), ...marks.map((m) => m.y), ...areas.flatMap((a) => [a.y, a.y + a.h])];
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
      .filter((z) => keepUnused || usedZones.has(z.key))
      .map((z) => ({ key: z.key, name: translated(z.name, z.i18n), color: z.color })),
    sections: draft.sections
      .filter((s) => keepUnused || usedSections.has(s.key))
      .map((s) => ({ key: s.key, name: translated(s.name, s.i18n) })),
    seats,
    marks,
    areas,
    ...(draft.rowNumbers ? { rowNumbers: true } : {}),
  };
}

/* Opérations groupées de l'éditeur, appliquées aux places sélectionnées. */

type Seats = DraftSeat[];

function apply(seats: Seats, selected: Set<string>, fn: (seat: DraftSeat) => DraftSeat): Seats {
  return seats.map((s) => (selected.has(s.id) ? fn(s) : s));
}

function centre(seats: Seats, selected: Set<string>): { x: number; y: number } {
  const picked = seats.filter((s) => selected.has(s.id));
  return {
    x: picked.reduce((sum, s) => sum + s.x, 0) / (picked.length || 1),
    y: picked.reduce((sum, s) => sum + s.y, 0) / (picked.length || 1),
  };
}

const angle = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

export function moveSeats(seats: Seats, selected: Set<string>, dx: number, dy: number): Seats {
  return apply(seats, selected, (s) => ({ ...s, x: round(s.x + dx), y: round(s.y + dy) }));
}

/** Même inclinaison pour chaque place, sans les déplacer. */
export function tiltSeats(seats: Seats, selected: Set<string>, deg: number): Seats {
  return apply(seats, selected, (s) => ({ ...s, rotate: angle(deg) }));
}

/** Fait tourner le bloc autour de son centre, places comprises. */
export function rotateGroup(seats: Seats, selected: Set<string>, deg: number): Seats {
  const c = centre(seats, selected);
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return apply(seats, selected, (s) => ({
    ...s,
    x: round(c.x + (s.x - c.x) * cos - (s.y - c.y) * sin),
    y: round(c.y + (s.x - c.x) * sin + (s.y - c.y) * cos),
    rotate: angle(s.rotate + deg),
  }));
}

export function alignSeats(seats: Seats, selected: Set<string>, axis: "row" | "column"): Seats {
  const c = centre(seats, selected);
  return apply(seats, selected, (s) =>
    axis === "row" ? { ...s, y: round(c.y), rotate: 0 } : { ...s, x: round(c.x) },
  );
}

/** Répartit les places à intervalles égaux entre les deux extrêmes du bloc. */
export function spaceSeats(seats: Seats, selected: Set<string>, orientation: Orientation): Seats {
  const picked = seats.filter((s) => selected.has(s.id));
  if (picked.length < 3) return seats;
  const [ux, uy] = axisOf(picked, orientation);
  const along = (s: DraftSeat) => s.x * ux + s.y * uy;
  const sorted = [...picked].sort((a, b) => along(a) - along(b));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const step = (along(last) - along(first)) / (sorted.length - 1);
  const target = new Map<string, number>();
  sorted.forEach((s, i) => target.set(s.id, along(first) + i * step));
  return apply(seats, selected, (s) => {
    const d = target.get(s.id)! - along(s);
    return { ...s, x: round(s.x + d * ux), y: round(s.y + d * uy) };
  });
}

/** Retourne le bloc de gauche à droite (côté symétrique d'une salle). */
export function mirrorSeats(seats: Seats, selected: Set<string>): Seats {
  const c = centre(seats, selected);
  return apply(seats, selected, (s) => ({ ...s, x: round(2 * c.x - s.x), rotate: angle(-s.rotate) }));
}

/**
 * Copie de la sélection, décalée sous le bloc. Les copies gardent rang et
 * numéros : elles sont signalées en double jusqu'à leur renumérotation.
 */
export function duplicateSeats(
  seats: Seats,
  selected: Set<string>,
  seatSize: number,
  newId: () => string,
): { seats: Seats; copies: Set<string> } {
  const picked = seats.filter((s) => selected.has(s.id));
  const ys = picked.map((s) => s.y);
  const dy = Math.max(...ys) - Math.min(...ys) + 1.5 * seatSize;
  const copies = picked.map((s) => ({ ...s, id: newId(), y: round(s.y + dy) }));
  return { seats: [...seats, ...copies], copies: new Set(copies.map((s) => s.id)) };
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
