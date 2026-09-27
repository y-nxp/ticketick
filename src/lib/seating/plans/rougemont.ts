import type { SeatDef, SeatLayout } from "../layout";

/**
 * Église de Rougemont — plan « Concert sans AFD » du 08.09.2026.
 *
 * Relevé siège par siège sur le PDF de la salle : 48 Premium (magenta,
 * « Kategorie invités » sur le plan), 83 en catégorie 1, 27 en 2, 118 en 3,
 * soit 276 places (le total de 278 imprimé sur le plan est faux). Le siège 1 des rangs 1 à 5 du chœur n'est dessiné que
 * par un trait ; il est compté, faute de quoi la catégorie 3 tomberait à 113.
 */

export const ROUGEMONT_PLAN_SLUG = "rougemont-eglise";

const PREMIUM = "PREMIUM";
const CAT1 = "CAT1";
const CAT2 = "CAT2";
const CAT3 = "CAT3";

function build(): SeatDef[] {
  const seats: SeatDef[] = [];
  const add = (
    section: string,
    row: number,
    number: number,
    zone: string,
    x: number,
    y: number,
    rotate?: number,
  ) =>
    seats.push({
      key: `${section}-${row}-${number}`,
      section,
      row: String(row),
      number: String(number),
      zone,
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      ...(rotate ? { rotate } : {}),
    });

  // Nef, rangs 1 à 15 : numéros décroissants de gauche à droite, allée au
  // centre entre la place 6 et la place 5.
  const rowY = [531, 557, 580, 603, 626, 648, 670, 693, 716, 740, 763, 786, 808, 829, 845];
  const seatX: Record<number, number> = {
    10: 400, 9: 416, 8: 431, 7: 446, 6: 460, 5: 510, 4: 525, 3: 539, 2: 554, 1: 568,
  };
  for (let row = 1; row <= 15; row++) {
    const y = rowY[row - 1]!;
    const premium = row <= 7;
    const numbers =
      row <= 4 ? [8, 7, 6, 5, 4, 3] : [9, 8, 7, 6, 5, 4, 3, 2];
    for (const n of numbers) add("NEF", row, n, premium ? PREMIUM : CAT1, seatX[n]!, y);
    // Places d'extrémité en catégorie 2 aux rangs 4, 7, 10 et 13.
    if ([4, 7, 10, 13].includes(row)) {
      add("NEF", row, 10, CAT2, seatX[10]!, y);
      add("NEF", row, 1, CAT2, seatX[1]!, y);
    }
  }

  // Rang 16, le long du mur droit : 1 et 2 en catégorie 2, 3 à 23 en 3.
  for (let n = 1; n <= 23; n++) {
    add("NEF", 16, n, n <= 2 ? CAT2 : CAT3, 642, 547 + (n - 1) * 13.8);
  }
  // Rang 17, le long du mur gauche : 22 places en catégorie 3.
  for (let n = 1; n <= 22; n++) {
    add("NEF", 17, n, CAT3, 320, 551 + (n - 1) * 13.5);
  }

  // Scène gauche (« Bühne links ») : colonnes 3, 2, 1 de gauche à droite.
  const leftY: Record<number, number> = { 6: 404, 5: 420, 4: 436, 3: 449, 2: 463, 1: 476 };
  const leftCol1Y: Record<number, number> = { 5: 417, 4: 432, 3: 447, 2: 461, 1: 476 };
  for (const [row, x] of [[3, 286], [2, 309]] as const) {
    for (let n = 1; n <= 6; n++) add("SG", row, n, n <= 3 ? CAT1 : CAT2, x, leftY[n]!);
  }
  for (let n = 1; n <= 5; n++) add("SG", 1, n, n <= 3 ? CAT1 : CAT2, 333, leftCol1Y[n]!);

  // Scène droite (« Bühne rechts ») : colonnes 1, 2, 3 de gauche à droite.
  // Pas de place 4 dans les colonnes 1 et 2.
  const rightY: Record<number, number> = { 7: 409, 6: 424, 5: 438, 4: 451, 3: 465, 2: 479, 1: 492 };
  for (const [row, x] of [[1, 620], [2, 647], [3, 677]] as const) {
    for (const n of row === 3 ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 5, 6, 7]) {
      add("SD", row, n, n <= 4 ? CAT1 : CAT2, x, rightY[n]!);
    }
  }

  // Chœur, rangs 1 à 6 face à la nef.
  for (let n = 1; n <= 8; n++) add("CH", 6, n, CAT3, 432 + (n - 1) * 14, 69);
  const choirY: Record<number, number> = { 5: 92, 4: 118, 3: 143, 2: 167, 1: 191 };
  for (let row = 1; row <= 5; row++) {
    for (let n = 1; n <= 7; n++) add("CH", row, n, CAT3, 433 + (n - 1) * 13.8, choirY[row]!);
  }

  // Bancs en biais de part et d'autre du chœur : 8 places chacun.
  const bench = (
    row: number,
    from: [number, number],
    to: [number, number],
    angle: number,
  ) => {
    for (let n = 1; n <= 8; n++) {
      const t = (n - 1) / 7;
      add("CH", row, n, CAT3, from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, angle);
    }
  };
  bench(8, [290, 242], [372, 182], -36);
  bench(7, [323, 268], [404, 207], -36);
  bench(10, [675, 240], [594, 182], 36);
  bench(9, [640, 265], [557, 206], 36);

  return seats;
}

export const rougemontLayout: SeatLayout = {
  viewBox: { x: 255, y: 30, w: 450, h: 870 },
  seatSize: 12,
  zones: [
    { key: PREMIUM, color: "#E13FE3", name: { fr: "Premium", en: "Premium", de: "Premium", it: "Premium" } },
    { key: CAT1, color: "#FFF59D", name: { fr: "Catégorie 1", en: "Category 1", de: "Kategorie 1", it: "Categoria 1" } },
    { key: CAT2, color: "#F08A8A", name: { fr: "Catégorie 2", en: "Category 2", de: "Kategorie 2", it: "Categoria 2" } },
    { key: CAT3, color: "#9FD4F5", name: { fr: "Catégorie 3", en: "Category 3", de: "Kategorie 3", it: "Categoria 3" } },
  ],
  sections: [
    { key: "NEF", name: { fr: "Nef", en: "Nave", de: "Schiff", it: "Navata" } },
    { key: "SG", name: { fr: "Scène gauche", en: "Stage left", de: "Bühne links", it: "Palco sinistro" } },
    { key: "SD", name: { fr: "Scène droite", en: "Stage right", de: "Bühne rechts", it: "Palco destro" } },
    { key: "CH", name: { fr: "Chœur", en: "Choir", de: "Chor", it: "Coro" } },
  ],
  seats: build(),
  marks: [
    { text: { fr: "Chœur", en: "Choir", de: "Chor", it: "Coro" }, x: 482, y: 50, size: 16 },
    { text: { fr: "Nef", en: "Nave", de: "Schiff", it: "Navata" }, x: 485, y: 870, size: 14 },
    { text: { fr: "Entrée", en: "Entrance", de: "Eingang", it: "Ingresso" }, x: 485, y: 890, size: 10 },
  ],
  areas: [
    {
      x: 372,
      y: 250,
      w: 213,
      h: 250,
      label: { fr: "Scène", en: "Stage", de: "Bühne", it: "Palco" },
    },
  ],
};
