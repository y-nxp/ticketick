import type { PlanRaster, PlanWord } from "./detect";

/**
 * Lecture du fichier fourni par la salle, dans le navigateur : première page
 * d'un PDF ou image, rendue sur un canevas pour l'analyse, avec le texte du
 * PDF quand il en a un.
 */

export interface LoadedPlan {
  raster: PlanRaster;
  words: PlanWord[];
  /** Fond de l'éditeur. */
  preview: string;
  /** Image allégée envoyée à l'IA pour lire la légende. */
  aiImage: string;
}

/** Côté le plus long du rendu : assez pour des places de 30 px sur un A4. */
const RENDER_SIZE = 2600;
const AI_SIZE = 1000;

export class PlanFileError extends Error {
  constructor(readonly key: "planFileType" | "planFileUnreadable") {
    super(key);
  }
}

function toJpeg(source: HTMLCanvasElement, maxSide: number, quality: number): string {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  if (scale === 1) return source.toDataURL("image/jpeg", quality);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

function finish(canvas: HTMLCanvasElement, words: PlanWord[]): LoadedPlan {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return {
    raster: { data: image.data, width: canvas.width, height: canvas.height },
    words,
    preview: toJpeg(canvas, RENDER_SIZE, 0.85),
    aiImage: toJpeg(canvas, AI_SIZE, 0.82),
  };
}

function whiteCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  // Les PNG transparents se lisent comme du noir sans fond blanc.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

async function loadImage(file: File): Promise<LoadedPlan> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new PlanFileError("planFileUnreadable");
  });
  // Une petite capture est agrandie : les traits entre places doivent rester
  // visibles après l'analyse.
  const scale = Math.min(2, RENDER_SIZE / Math.max(bitmap.width, bitmap.height));
  const canvas = whiteCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = scale < 1;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return finish(canvas, []);
}

async function loadPdf(file: File): Promise<LoadedPlan> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    return await readPdf(pdfjs, await task.promise.catch(() => {
      throw new PlanFileError("planFileUnreadable");
    }));
  } finally {
    await task.destroy();
  }
}

async function readPdf(
  pdfjs: typeof import("pdfjs-dist"),
  doc: import("pdfjs-dist").PDFDocumentProxy,
): Promise<LoadedPlan> {
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = RENDER_SIZE / Math.max(base.width, base.height);
  const viewport = page.getViewport({ scale });
  const canvas = whiteCanvas(Math.round(viewport.width), Math.round(viewport.height));
  await page.render({ canvas, viewport }).promise;

  const content = await page.getTextContent();
  const words: PlanWord[] = [];
  for (const item of content.items) {
    if (!("str" in item) || !item.str.trim()) continue;
    const [a, b, c, d, e, f] = pdfjs.Util.transform(viewport.transform, item.transform) as number[];
    const size = Math.hypot(c!, d!);
    if (size < 1) continue;
    const ux = a! / Math.hypot(a!, b!);
    const uy = b! / Math.hypot(a!, b!);
    // Vers le haut du texte, en coordonnées d'écran.
    const vx = c! / size;
    const vy = d! / size;
    const length = item.width * scale;
    const angle = Math.atan2(uy, ux);
    // Un bloc « 5 4 3 » est découpé en mots, placés au prorata des caractères.
    const chars = item.str.length;
    for (const match of item.str.matchAll(/\S+/g)) {
      const start = (match.index / chars) * length;
      const span = (match[0].length / chars) * length;
      const mid = start + span / 2;
      words.push({
        text: match[0],
        x: e! + ux * mid + vx * size * 0.35,
        y: f! + uy * mid + vy * size * 0.35,
        w: Math.abs(ux) * span + Math.abs(uy) * size,
        h: size,
        angle,
      });
    }
  }
  return finish(canvas, words);
}

export async function loadPlanFile(file: File): Promise<LoadedPlan> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return loadPdf(file);
  }
  if (/^image\/(png|jpeg|webp)$/.test(file.type)) return loadImage(file);
  throw new PlanFileError("planFileType");
}
