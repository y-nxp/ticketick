/**
 * Relevé automatique d'un plan de salle.
 *
 * Tourne dans le navigateur de l'administrateur, sur l'image du plan : aucune
 * dépendance serveur, et le fichier de la salle ne quitte pas le poste.
 *
 * Les sièges sont repérés par leur couleur de catégorie : sur les plans
 * fournis par les salles, murs, textes et traits sont gris ou noirs, les
 * places sont des aplats colorés séparés par un trait. Chaque aplat de la
 * taille dominante est une place ; les grands aplats de même couleur sont les
 * pastilles de la légende. Quand le plan est un PDF, son texte donne les
 * numéros imprimés dans les sièges, les numéros de rangs et les noms de zones.
 */

export interface PlanRaster {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Mot du PDF, en pixels de l'image : centre, hauteur de police, angle. */
export interface PlanWord {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
}

export interface DraftSeat {
  id: string;
  x: number;
  y: number;
  /** Inclinaison en degrés, déduite de l'alignement du rang. */
  rotate: number;
  zone: string;
  section: string | null;
  row: string | null;
  number: string | null;
}

export interface DraftZone {
  key: string;
  color: string;
  name: string;
  /** Nombre de places annoncé par la légende, pour contrôle. */
  declared: number | null;
}

export interface DraftSection {
  key: string;
  name: string;
}

export interface DraftMark {
  text: string;
  x: number;
  y: number;
  size: number;
}

export interface PlanDraft {
  width: number;
  height: number;
  /** Côté d'une place, en pixels de l'image. */
  seatSize: number;
  seats: DraftSeat[];
  zones: DraftZone[];
  sections: DraftSection[];
  marks: DraftMark[];
  declaredTotal: number | null;
}

interface Blob {
  cluster: number;
  area: number;
  cx: number;
  cy: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Cluster {
  r: number;
  g: number;
  b: number;
  weight: number;
}

const COLOR_RADIUS = 48;

/** Pixel coloré : ni blanc, ni gris, ni noir. */
function isColored(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max > 120 && max - min > 0.235 * max;
}

function hex(c: Cluster): string {
  const h = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`.toUpperCase();
}

/**
 * Regroupe les couleurs de l'image en teintes franches. L'anticrénelage
 * produit des milliers de nuances intermédiaires ; les teintes réelles sont
 * celles qui couvrent le plus de pixels.
 */
function clusterColors(raster: PlanRaster): { clusters: Cluster[]; bucketCluster: Int16Array } {
  const counts = new Uint32Array(32768);
  const { data } = raster;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    if (!isColored(r, g, b)) continue;
    counts[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)]!++;
  }
  const buckets = [...counts.keys()]
    .filter((k) => counts[k]! > 0)
    .sort((a, b) => counts[b]! - counts[a]!);

  const total = buckets.reduce((sum, k) => sum + counts[k]!, 0);
  const clusters: Cluster[] = [];
  const bucketCluster = new Int16Array(32768).fill(-1);
  for (const k of buckets) {
    const r = ((k >> 10) << 3) + 4;
    const g = (((k >> 5) & 31) << 3) + 4;
    const b = ((k & 31) << 3) + 4;
    let best = -1;
    let bestDist = COLOR_RADIUS;
    clusters.forEach((c, i) => {
      const d = Math.hypot(c.r - r, c.g - g, c.b - b);
      if (d < bestDist) {
        best = i;
        bestDist = d;
      }
    });
    const n = counts[k]!;
    if (best === -1) {
      // Une nuance isolée et rare n'est qu'un bord anticrénelé.
      if (n < total * 0.0005 || clusters.length >= 24) continue;
      clusters.push({ r, g, b, weight: n });
      best = clusters.length - 1;
    } else {
      const c = clusters[best]!;
      // Le centre suit les nuances dominantes, pas les bords.
      if (bestDist < COLOR_RADIUS / 2) {
        c.r = (c.r * c.weight + r * n) / (c.weight + n);
        c.g = (c.g * c.weight + g * n) / (c.weight + n);
        c.b = (c.b * c.weight + b * n) / (c.weight + n);
      }
      c.weight += n;
    }
    bucketCluster[k] = best;
  }
  return { clusters, bucketCluster };
}

/** Aplats connexes d'une même teinte (4-connexité : les traits les séparent). */
function findBlobs(raster: PlanRaster, bucketCluster: Int16Array): Blob[] {
  const { data, width, height } = raster;
  const n = width * height;
  const cluster = new Int16Array(n).fill(-1);
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    if (!isColored(r, g, b)) continue;
    cluster[p] = bucketCluster[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)]!;
  }

  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  const blobs: Blob[] = [];
  for (let start = 0; start < n; start++) {
    const c = cluster[start]!;
    if (c < 0 || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    let area = 0;
    let sx = 0;
    let sy = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    while (top > 0) {
      const p = stack[--top]!;
      const x = p % width;
      const y = (p - x) / width;
      area++;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && !seen[p - 1] && cluster[p - 1] === c) {
        seen[p - 1] = 1;
        stack[top++] = p - 1;
      }
      if (x < width - 1 && !seen[p + 1] && cluster[p + 1] === c) {
        seen[p + 1] = 1;
        stack[top++] = p + 1;
      }
      if (y > 0 && !seen[p - width] && cluster[p - width] === c) {
        seen[p - width] = 1;
        stack[top++] = p - width;
      }
      if (y < height - 1 && !seen[p + width] && cluster[p + width] === c) {
        seen[p + width] = 1;
        stack[top++] = p + width;
      }
    }
    blobs.push({ cluster: c, area, cx: sx / area, cy: sy / area, minX, minY, maxX, maxY });
  }
  return blobs;
}

/** Surface d'une place : la classe de taille la plus fréquente. */
function dominantArea(blobs: Blob[], minArea: number): number {
  const bins = new Map<number, number>();
  for (const b of blobs) {
    if (b.area < minArea) continue;
    const bin = Math.round(Math.log2(b.area) * 4);
    bins.set(bin, (bins.get(bin) ?? 0) + 1);
  }
  let bestBin = 0;
  let bestScore = -1;
  for (const [bin, count] of bins) {
    // Les classes voisines comptent aussi : un siège à cheval entre deux
    // classes ne doit pas faire gagner une classe de parasites.
    const score = count + 0.5 * ((bins.get(bin - 1) ?? 0) + (bins.get(bin + 1) ?? 0));
    if (score > bestScore) {
      bestScore = score;
      bestBin = bin;
    }
  }
  return 2 ** (bestBin / 4);
}

const PLACES = /(\d+)\s*(pl[aä]tze|places?|posti|seats?|sitze|sitzpl[aä]tze)/i;

function isNumeric(text: string): boolean {
  return /^\d{1,4}[a-zA-Z]?$/.test(text);
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** Direction principale d'un nuage de points, en radians. */
function principalAngle(points: { x: number; y: number }[]): number {
  const mx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const my = points.reduce((s, p) => s + p.y, 0) / points.length;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const p of points) {
    xx += (p.x - mx) ** 2;
    yy += (p.y - my) ** 2;
    xy += (p.x - mx) * (p.y - my);
  }
  return 0.5 * Math.atan2(2 * xy, xx - yy);
}

class UnionFind {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]!]!;
      i = this.parent[i]!;
    }
    return i;
  }
  union(a: number, b: number) {
    this.parent[this.find(a)] = this.find(b);
  }
}

interface Row {
  seats: number[];
  angle: number;
}

/**
 * Enchaîne les places en rangs : deux places voisines dont les numéros se
 * suivent appartiennent au même rang. Deux places empilées portent le même
 * numéro, ce qui sépare les rangs serrés sans connaître leur orientation.
 */
function buildRows(seats: DraftSeat[], size: number): Row[] {
  const num = seats.map((s) => (s.number && /^\d+$/.test(s.number) ? Number(s.number) : NaN));
  const links: number[][] = seats.map(() => []);
  const pairs: { a: number; b: number; d: number }[] = [];
  for (let a = 0; a < seats.length; a++) {
    for (let b = a + 1; b < seats.length; b++) {
      if (Math.abs(num[a]! - num[b]!) !== 1) continue;
      const d = dist(seats[a]!.x, seats[a]!.y, seats[b]!.x, seats[b]!.y);
      if (d < 1.9 * size) pairs.push({ a, b, d });
    }
  }
  pairs.sort((p, q) => p.d - q.d);

  const opposite = (at: number, to: number) => {
    const other = links[at]![0];
    if (other === undefined) return true;
    const s = seats[at]!;
    const u = [seats[other]!.x - s.x, seats[other]!.y - s.y];
    const v = [seats[to]!.x - s.x, seats[to]!.y - s.y];
    const cos = (u[0]! * v[0]! + u[1]! * v[1]!) / (Math.hypot(u[0]!, u[1]!) * Math.hypot(v[0]!, v[1]!));
    return cos < -0.7;
  };
  for (const { a, b } of pairs) {
    if (links[a]!.length >= 2 || links[b]!.length >= 2) continue;
    if (!opposite(a, b) || !opposite(b, a)) continue;
    links[a]!.push(b);
    links[b]!.push(a);
  }

  // Chaînes.
  const chainOf = new Array<number>(seats.length).fill(-1);
  const chains: number[][] = [];
  for (let i = 0; i < seats.length; i++) {
    if (chainOf[i] !== -1 || Number.isNaN(num[i]!) || links[i]!.length > 1) continue;
    const chain: number[] = [];
    let prev = -1;
    let cur = i;
    while (cur !== -1 && chainOf[cur] === -1) {
      chainOf[cur] = chains.length;
      chain.push(cur);
      const next = links[cur]!.find((n) => n !== prev) ?? -1;
      prev = cur;
      cur = next;
    }
    chains.push(chain);
  }

  const direction = (chain: number[]) =>
    chain.length > 1 ? principalAngle(chain.map((i) => seats[i]!)) : NaN;

  // Rangs coupés par une allée : les chaînes alignées dont les numéros
  // continuent se rejoignent.
  const rows: Row[] = chains.map((c) => ({ seats: c, angle: direction(c) }));
  const alive = rows.map(() => true);
  const ends = (r: Row) => [r.seats[0]!, r.seats[r.seats.length - 1]!];
  let merged = true;
  while (merged) {
    merged = false;
    let best: { a: number; b: number; ea: number; eb: number; d: number } | null = null;
    for (let a = 0; a < rows.length; a++) {
      if (!alive[a]) continue;
      for (let b = a + 1; b < rows.length; b++) {
        if (!alive[b]) continue;
        const ra = rows[a]!;
        const rb = rows[b]!;
        if (Number.isNaN(ra.angle) && Number.isNaN(rb.angle)) continue;
        for (const ea of ends(ra)) {
          for (const eb of ends(rb)) {
            const gap = Math.abs(num[ea]! - num[eb]!);
            if (gap < 1 || gap > 3) continue;
            const d = dist(seats[ea]!.x, seats[ea]!.y, seats[eb]!.x, seats[eb]!.y);
            if (d > 8 * size) continue;
            const along = Math.atan2(seats[eb]!.y - seats[ea]!.y, seats[eb]!.x - seats[ea]!.x);
            const aligned = [ra.angle, rb.angle]
              .filter((x) => !Number.isNaN(x))
              .every((x) => Math.abs(Math.sin(along - x)) * d < 0.45 * size);
            if (!aligned) continue;
            // Le numéro doit continuer dans le sens du rang, pas revenir.
            const aOthers = ra.seats.filter((s) => s !== ea);
            const bOthers = rb.seats.filter((s) => s !== eb);
            const trendA = aOthers.length ? Math.sign(num[ea]! - num[aOthers[0]!]!) : 0;
            const trendB = bOthers.length ? Math.sign(num[bOthers[0]!]! - num[eb]!) : 0;
            const step = Math.sign(num[eb]! - num[ea]!);
            if ((trendA && trendA !== step) || (trendB && trendB !== step)) continue;
            if (!best || d < best.d) best = { a, b, ea, eb, d };
          }
        }
      }
    }
    if (best) {
      const ra = rows[best.a]!;
      const rb = rows[best.b]!;
      const aSeats = best.ea === ra.seats[0] ? [...ra.seats].reverse() : ra.seats;
      const bSeats = best.eb === rb.seats[0] ? rb.seats : [...rb.seats].reverse();
      ra.seats = [...aSeats, ...bSeats];
      ra.angle = direction(ra.seats);
      alive[best.b] = false;
      merged = true;
    }
  }

  // Place dessinée sans numéro au bout d'un rang : elle en prolonge la suite.
  const result = rows.filter((_, i) => alive[i]);
  const taken = new Set(result.flatMap((r) => r.seats));
  for (let i = 0; i < seats.length; i++) {
    if (taken.has(i) || seats[i]!.number) continue;
    let best: { row: Row; end: number; d: number } | null = null;
    for (const row of result) {
      if (row.seats.length < 2) continue;
      for (const end of ends(row)) {
        const d = dist(seats[i]!.x, seats[i]!.y, seats[end]!.x, seats[end]!.y);
        const along = Math.atan2(seats[i]!.y - seats[end]!.y, seats[i]!.x - seats[end]!.x);
        if (d < 1.9 * size && Math.abs(Math.sin(along - row.angle)) * d < 0.45 * size && (!best || d < best.d)) {
          best = { row, end, d };
        }
      }
    }
    if (!best) continue;
    const { row, end } = best;
    const atStart = end === row.seats[0];
    const neighbour = atStart ? row.seats[1]! : row.seats[row.seats.length - 2]!;
    const next = num[end]! + (num[end]! - num[neighbour]!);
    if (next > 0) {
      seats[i]!.number = String(next);
      num[i] = next;
    }
    row.seats = atStart ? [i, ...row.seats] : [...row.seats, i];
    taken.add(i);
  }
  return result;
}

/** Numéros de rangs : textes plus grands que les numéros de places, dans l'axe du rang. */
function labelRows(
  rows: Row[],
  seats: DraftSeat[],
  words: PlanWord[],
  seatNumberHeight: number,
  size: number,
): Map<Row, PlanWord> {
  const candidates = words.filter(
    (w) => /^\d{1,3}[a-zA-Z]?$|^[A-Z]{1,2}$/.test(w.text) && w.h > 1.2 * seatNumberHeight,
  );
  const pairs: { row: Row; word: PlanWord; cost: number }[] = [];
  for (const row of rows) {
    const pts = row.seats.map((i) => seats[i]!);
    const angle = Number.isNaN(row.angle) ? 0 : row.angle;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const ox = pts[0]!.x;
    const oy = pts[0]!.y;
    const along = pts.map((p) => (p.x - ox) * ux + (p.y - oy) * uy);
    const lo = Math.min(...along);
    const hi = Math.max(...along);
    for (const word of candidates) {
      const t = (word.x - ox) * ux + (word.y - oy) * uy;
      const perp = Math.abs(-(word.x - ox) * uy + (word.y - oy) * ux);
      if (perp > 0.7 * size) continue;
      const outside = t < lo ? lo - t : t > hi ? t - hi : 0;
      if (outside > 3.5 * size) continue;
      // Au milieu d'un rang, le texte doit tomber dans une allée, pas sur une place.
      if (outside === 0 && pts.some((p) => dist(p.x, p.y, word.x, word.y) < 0.8 * size)) continue;
      pairs.push({ row, word, cost: outside + perp });
    }
  }
  pairs.sort((a, b) => a.cost - b.cost);
  const labels = new Map<Row, PlanWord>();
  const used = new Set<PlanWord>();
  for (const { row, word } of pairs) {
    if (labels.has(row) || used.has(word)) continue;
    labels.set(row, word);
    used.add(word);
  }
  return labels;
}

/** Phrases du PDF : mots d'une même ligne, proches, réunis. */
function phrases(words: PlanWord[]): PlanWord[] {
  // De gauche à droite : une phrase commence toujours par son premier mot,
  // même quand la ligne de base ondule d'un pixel.
  const sorted = [...words].sort((a, b) => a.x - b.x);
  const out: PlanWord[] = [];
  const used = new Set<PlanWord>();
  for (const w of sorted) {
    if (used.has(w)) continue;
    used.add(w);
    const group = [w];
    let last = w;
    for (;;) {
      const next = sorted.find(
        (o) =>
          !used.has(o) &&
          Math.abs(o.y - last.y) < 0.5 * last.h &&
          o.x > last.x &&
          o.x - o.w / 2 - (last.x + last.w / 2) < 1.2 * last.h,
      );
      if (!next) break;
      used.add(next);
      group.push(next);
      last = next;
    }
    const minX = Math.min(...group.map((g) => g.x - g.w / 2));
    const maxX = Math.max(...group.map((g) => g.x + g.w / 2));
    out.push({
      text: group.map((g) => g.text).join(" "),
      x: (minX + maxX) / 2,
      y: group.reduce((s, g) => s + g.y, 0) / group.length,
      w: maxX - minX,
      h: Math.max(...group.map((g) => g.h)),
      angle: w.angle,
    });
  }
  return out;
}

function sectionKey(name: string, used: Set<string>): string {
  const base =
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 12) || "S";
  let key = base;
  for (let i = 2; used.has(key); i++) key = `${base}${i}`;
  used.add(key);
  return key;
}

export function seatKey(seat: Pick<DraftSeat, "section" | "row" | "number">): string {
  return `${seat.section}-${seat.row}-${seat.number}`;
}

export function detectPlan(raster: PlanRaster, words: PlanWord[] = []): PlanDraft {
  const { width, height } = raster;
  const { clusters, bucketCluster } = clusterColors(raster);
  const blobs = findBlobs(raster, bucketCluster);

  const minArea = Math.max(16, width * height * 1e-5);
  const area = dominantArea(blobs, minArea);
  const isSeat = (b: Blob) => {
    if (b.area < 0.4 * area || b.area > 1.6 * area) return false;
    const bw = b.maxX - b.minX + 1;
    const bh = b.maxY - b.minY + 1;
    return Math.min(bw, bh) / Math.max(bw, bh) > 0.3;
  };
  const seatBlobs = blobs.filter(isSeat);
  // Places accolées dont le trait de séparation est interrompu : un aplat
  // droit de deux à quatre places, découpé dans sa longueur.
  for (const b of blobs) {
    const k = Math.round(b.area / area);
    if (k < 2 || k > 4 || Math.abs(b.area / area - k) > 0.35) continue;
    const bw = b.maxX - b.minX + 1;
    const bh = b.maxY - b.minY + 1;
    const long = Math.max(bw, bh);
    const short = Math.min(bw, bh);
    if (b.area < 0.75 * bw * bh || Math.abs(long / short - k) > 0.5) continue;
    for (let i = 0; i < k; i++) {
      const t = (i + 0.5) / k;
      const cx = bw >= bh ? b.minX + t * bw : b.cx;
      const cy = bw >= bh ? b.cy : b.minY + t * bh;
      seatBlobs.push({
        cluster: b.cluster,
        area: b.area / k,
        cx,
        cy,
        minX: bw >= bh ? b.minX + (i * bw) / k : b.minX,
        minY: bw >= bh ? b.minY : b.minY + (i * bh) / k,
        maxX: bw >= bh ? b.minX + ((i + 1) * bw) / k : b.maxX,
        maxY: bw >= bh ? b.maxY : b.minY + ((i + 1) * bh) / k,
      });
    }
  }
  const size = Math.sqrt(area) * 1.08;

  const seatClusters = [...new Set(seatBlobs.map((b) => b.cluster))];
  const zoneOf = new Map(seatClusters.map((c, i) => [c, `Z${i + 1}`]));

  // Légende : grandes pastilles rectangulaires aux couleurs des places.
  const legendWords = new Set<PlanWord>();
  const zones: DraftZone[] = seatClusters.map((c, i) => ({
    key: `Z${i + 1}`,
    color: hex(clusters[c]!),
    name: "",
    declared: null,
  }));
  let legendBox = null as { minX: number; minY: number; maxX: number; maxY: number } | null;
  for (const b of blobs) {
    const key = zoneOf.get(b.cluster);
    if (!key || b.area < 3 * area) continue;
    const bw = b.maxX - b.minX + 1;
    const bh = b.maxY - b.minY + 1;
    if (b.area < 0.8 * bw * bh || bw > 12 * bh) continue;
    const beside = words
      .filter((w) => w.y > b.minY - bh * 0.3 && w.y < b.maxY + bh * 0.3 && w.x > b.maxX)
      .sort((p, q) => p.x - q.x);
    // La ligne s'arrête au premier grand blanc : au-delà commence le plan.
    const line: PlanWord[] = [];
    let edge = b.maxX;
    for (const w of beside) {
      if (w.x - w.w / 2 - edge > Math.max(1.5 * w.h, line.length ? 0 : bw)) break;
      line.push(w);
      edge = w.x + w.w / 2;
    }
    if (line.length === 0) continue;
    const zone = zones.find((z) => z.key === key)!;
    if (zone.name) continue;
    line.forEach((w) => legendWords.add(w));
    const text = line.map((w) => w.text).join(" ").replace(/\s+/g, " ").trim();
    const places = text.match(PLACES);
    zone.declared = places ? Number(places[1]) : null;
    zone.name = (places ? text.replace(places[0], "") : text).replace(/\s+/g, " ").trim();
    const right = Math.max(...line.map((w) => w.x + w.w / 2));
    legendBox = {
      minX: Math.min(legendBox?.minX ?? Infinity, b.minX),
      minY: Math.min(legendBox?.minY ?? Infinity, b.minY),
      maxX: Math.max(legendBox?.maxX ?? -Infinity, right),
      maxY: Math.max(legendBox?.maxY ?? -Infinity, b.maxY),
    };
  }
  // Une teinte que la légende ignore et presque absente du plan est un décor
  // (repère de scène, chaire), pas une catégorie.
  const kept = zones.filter(
    (z) => z.name || seatBlobs.filter((b) => zoneOf.get(b.cluster) === z.key).length >= 3,
  );
  const keptKeys = new Set(kept.map((z) => z.key));
  zones.splice(0, zones.length, ...kept);
  seatBlobs.splice(
    0,
    seatBlobs.length,
    ...seatBlobs.filter((b) => keptKeys.has(zoneOf.get(b.cluster)!)),
  );
  zones.forEach((z, i) => {
    if (!z.name) z.name = `Catégorie ${i + 1}`;
  });

  // Place traversée par un trait (battant de porte, ligne d'allée) : ses
  // morceaux réunis forment un siège.
  const side = Math.sqrt(area);
  const fragments = blobs.filter(
    (b) => keptKeys.has(zoneOf.get(b.cluster) ?? "") && b.area >= 0.06 * area && b.area < 0.4 * area,
  );
  const fuf = new UnionFind(fragments.length);
  const gap = Math.max(3, 0.12 * side);
  for (let a = 0; a < fragments.length; a++) {
    for (let b = a + 1; b < fragments.length; b++) {
      const p = fragments[a]!;
      const q = fragments[b]!;
      if (p.cluster !== q.cluster) continue;
      if (q.minX - p.maxX > gap || p.minX - q.maxX > gap) continue;
      if (q.minY - p.maxY > gap || p.minY - q.maxY > gap) continue;
      fuf.union(a, b);
    }
  }
  const pieces = new Map<number, Blob[]>();
  fragments.forEach((f, i) => {
    const root = fuf.find(i);
    const list = pieces.get(root);
    if (list) list.push(f);
    else pieces.set(root, [f]);
  });
  for (const list of pieces.values()) {
    const total = list.reduce((s, f) => s + f.area, 0);
    const minX = Math.min(...list.map((f) => f.minX));
    const maxX = Math.max(...list.map((f) => f.maxX));
    const minY = Math.min(...list.map((f) => f.minY));
    const maxY = Math.max(...list.map((f) => f.maxY));
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    if (total > 1.4 * area || Math.max(bw, bh) > 1.6 * side) continue;
    // Un morceau trop petit pour être un siège entier en est un s'il porte
    // un numéro : le numéro, centré dans la place, en donne alors le centre.
    const pad = 0.3 * side;
    const label = words.find(
      (w) =>
        isNumeric(w.text) &&
        !legendWords.has(w) &&
        w.x > minX - pad &&
        w.x < maxX + pad &&
        w.y > minY - pad &&
        w.y < maxY + pad,
    );
    const whole =
      list.length >= 2 && total >= 0.5 * area && Math.min(bw, bh) / Math.max(bw, bh) >= 0.3;
    if (!whole && !(label && total >= 0.25 * area)) continue;
    // Éclat d'anticrénelage au bord d'une place déjà relevée.
    const x0 = label && !whole ? label.x : (minX + maxX) / 2;
    const y0 = label && !whole ? label.y : (minY + maxY) / 2;
    if (seatBlobs.some((s) => dist(s.cx, s.cy, x0, y0) < 0.9 * side)) continue;
    seatBlobs.push({
      cluster: list[0]!.cluster,
      area: total,
      cx: label && !whole ? label.x : list.reduce((s, f) => s + f.cx * f.area, 0) / total,
      cy: label && !whole ? label.y : list.reduce((s, f) => s + f.cy * f.area, 0) / total,
      minX,
      minY,
      maxX,
      maxY,
    });
  }

  let declaredTotal: number | null = null;
  for (const p of phrases(words)) {
    const m = /total\D{0,3}(\d+)/i.exec(p.text);
    if (m) declaredTotal = Number(m[1]);
  }

  // Numéros imprimés dans les sièges.
  const seats: DraftSeat[] = seatBlobs.map((b, i) => ({
    id: `s${i}`,
    x: b.cx,
    y: b.cy,
    rotate: 0,
    zone: zoneOf.get(b.cluster)!,
    section: null,
    row: null,
    number: null,
  }));
  const numberWords = new Set<PlanWord>();
  for (const word of words) {
    if (!isNumeric(word.text) || legendWords.has(word)) continue;
    let best: DraftSeat | null = null;
    let bestD = 0.62 * size;
    for (const s of seats) {
      const d = dist(s.x, s.y, word.x, word.y);
      if (d < bestD) {
        best = s;
        bestD = d;
      }
    }
    if (best && !best.number) {
      best.number = word.text;
      numberWords.add(word);
    }
  }
  const numberHeights = [...numberWords].map((w) => w.h).sort((a, b) => a - b);
  const seatNumberHeight = numberHeights[Math.floor(numberHeights.length / 2)] ?? size * 0.6;

  const rows = buildRows(seats, size);
  const free = words.filter((w) => !numberWords.has(w) && !legendWords.has(w));
  const labels = labelRows(rows, seats, free, seatNumberHeight, size);
  const marks: DraftMark[] = [];
  for (const row of rows) {
    const label = labels.get(row);
    const deg = Number.isNaN(row.angle) ? 0 : (row.angle * 180) / Math.PI;
    // Les rangs droits (horizontaux ou verticaux) gardent des places droites.
    const tilt = ((deg % 180) + 180) % 180;
    const rotate = Math.min(tilt, 180 - tilt) < 8 || Math.abs(tilt - 90) < 8 ? 0 : tilt > 90 ? tilt - 180 : tilt;
    for (const i of row.seats) {
      seats[i]!.row = label?.text ?? null;
      seats[i]!.rotate = Math.round(rotate);
    }
    if (label) marks.push({ text: label.text, x: label.x, y: label.y, size: label.h });
  }

  // Sans numéros lisibles (image sans texte), il n'y a ni rangs ni zones à
  // déduire : tout part dans une zone unique, découpée dans l'éditeur.
  if (numberWords.size === 0) {
    for (const s of seats) s.section = "SALLE";
    return {
      width,
      height,
      seatSize: size,
      seats,
      zones,
      sections: [{ key: "SALLE", name: "Salle" }],
      marks,
      declaredTotal,
    };
  }

  // Zones de la salle : rangs voisins réunis. Deux rangs se rejoignent s'ils
  // sont parallèles, proches et côte à côte ; bout à bout, ce sont deux zones
  // (le rang du mur de la nef qui commence au pied d'une estrade).
  const uf = new UnionFind(seats.length);
  for (const row of rows) row.seats.forEach((i) => uf.union(i, row.seats[0]!));
  const near = (a: number[], b: number[]) =>
    a.some((i) => b.some((j) => dist(seats[i]!.x, seats[i]!.y, seats[j]!.x, seats[j]!.y) < 2.6 * size));
  const sideBySide = (a: Row, b: Row) => {
    if (Number.isNaN(a.angle) || Number.isNaN(b.angle)) return true;
    if (Math.abs(Math.sin(a.angle - b.angle)) > 0.26) return false;
    const ux = Math.cos(a.angle);
    const uy = Math.sin(a.angle);
    const along = (r: Row) => r.seats.map((i) => seats[i]!.x * ux + seats[i]!.y * uy);
    const pa = along(a);
    const pb = along(b);
    return Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) > -0.5 * size;
  };
  for (let a = 0; a < rows.length; a++) {
    for (let b = a + 1; b < rows.length; b++) {
      if (sideBySide(rows[a]!, rows[b]!) && near(rows[a]!.seats, rows[b]!.seats)) {
        uf.union(rows[a]!.seats[0]!, rows[b]!.seats[0]!);
      }
    }
  }
  const inRow = new Set(rows.flatMap((r) => r.seats));
  for (let a = 0; a < seats.length; a++) {
    if (inRow.has(a)) continue;
    for (let b = 0; b < seats.length; b++) {
      if (a !== b && dist(seats[a]!.x, seats[a]!.y, seats[b]!.x, seats[b]!.y) < 2.6 * size) uf.union(a, b);
    }
  }
  const groups = new Map<number, number[]>();
  seats.forEach((_, i) => {
    const root = uf.find(i);
    const members = groups.get(root);
    if (members) members.push(i);
    else groups.set(root, [i]);
  });

  const inLegend = (w: PlanWord) =>
    legendBox !== null &&
    w.x > legendBox.minX - 2 * size &&
    w.x < legendBox.maxX + 2 * size &&
    w.y > legendBox.minY - 6 * seatNumberHeight &&
    w.y < legendBox.maxY + 4 * seatNumberHeight;
  const names = phrases(free.filter((w) => !inLegend(w))).filter(
    // Les mentions du cartouche (« Échelle : », « Date : ») ne nomment rien.
    (p) => /\p{L}{3,}/u.test(p.text) && !PLACES.test(p.text) && !p.text.trim().endsWith(":"),
  );

  const named = [...groups.values()].map((members) => {
    let best: PlanWord | null = null;
    let bestD = 5 * size;
    for (const p of names) {
      for (const i of members) {
        const d = Math.max(0, dist(seats[i]!.x, seats[i]!.y, p.x, p.y) - p.w / 2);
        if (d < bestD) {
          best = p;
          bestD = d;
        }
      }
    }
    return { members, name: best?.text ?? null, phrase: best };
  });
  const keysOf = (members: number[]) => new Set(members.map((i) => `${seats[i]!.row}-${seats[i]!.number}`));
  const collides = (a: number[], b: number[]) => {
    const ka = keysOf(a);
    return b.some((i) => ka.has(`${seats[i]!.row}-${seats[i]!.number}`));
  };

  // Même nom, même zone de salle, sauf si les places y porteraient les mêmes références.
  const sectionsByName = new Map<string, number[]>();
  const unnamed: number[][] = [];
  for (const g of named) {
    if (!g.name) {
      unnamed.push(g.members);
      continue;
    }
    const existing = sectionsByName.get(g.name);
    if (existing && !collides(existing, g.members)) existing.push(...g.members);
    else if (!existing) sectionsByName.set(g.name, [...g.members]);
    else unnamed.push(g.members);
  }
  // Groupe sans nom : rattaché au groupe nommé dont il continue la
  // numérotation des rangs (rangs 16 et 17 le long des murs de la nef), sinon
  // au plus proche, pourvu qu'il n'y crée pas de doublon.
  const rowNumbers = (members: number[]) =>
    members.map((i) => Number(seats[i]!.row)).filter((n) => Number.isFinite(n));
  const leftovers: number[][] = [];
  for (const members of unnamed) {
    const own = rowNumbers(members);
    const first = own.length ? Math.min(...own) : NaN;
    let best: string | null = null;
    let bestScore = Infinity;
    for (const [name, other] of sectionsByName) {
      if (collides(other, members)) continue;
      let d = Infinity;
      for (const i of members) {
        for (const j of other) {
          d = Math.min(d, dist(seats[i]!.x, seats[i]!.y, seats[j]!.x, seats[j]!.y));
        }
      }
      const theirs = rowNumbers(other);
      const continues =
        !theirs.includes(first) && theirs.some((r) => first - r >= 1 && first - r <= 2);
      if (d > (continues ? 25 : 10) * size) continue;
      const score = continues ? d / 100 : d;
      if (score < bestScore) {
        best = name;
        bestScore = score;
      }
    }
    if (best) sectionsByName.get(best)!.push(...members);
    else leftovers.push(members);
  }

  const usedKeys = new Set<string>();
  const sections: DraftSection[] = [];
  for (const [name, members] of sectionsByName) {
    const key = sectionKey(name, usedKeys);
    sections.push({ key, name });
    members.forEach((i) => (seats[i]!.section = key));
    const phrase = named.find((g) => g.name === name)?.phrase;
    if (phrase) marks.push({ text: name, x: phrase.x, y: phrase.y, size: phrase.h });
  }
  if (sections.length === 0 || leftovers.length > 0) {
    // Tout ce qui reste tient dans une zone par défaut, à renommer.
    leftovers.forEach((members, n) => {
      const name = sections.length === 0 && leftovers.length === 1 ? "Salle" : `Zone ${n + 1}`;
      const key = sectionKey(name, usedKeys);
      sections.push({ key, name });
      members.forEach((i) => (seats[i]!.section = key));
    });
  }

  return {
    width,
    height,
    seatSize: size,
    seats,
    zones,
    sections,
    marks,
    declaredTotal,
  };
}
