import "server-only";

import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export class UploadError extends Error {
  constructor(readonly key: "imageTooLarge" | "imageType") {
    super(key);
  }
}

export function uploadRoot(): string {
  return process.env.UPLOAD_DIR?.trim() || join(process.cwd(), "data", "uploads");
}

/** Enregistre un fichier image et renvoie le chemin public `/uploads/…`. */
export async function saveUploadedImage(
  file: FormDataEntryValue | null,
  folder: string,
): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_BYTES) throw new UploadError("imageTooLarge");
  const ext = TYPES[file.type];
  if (!ext) throw new UploadError("imageType");

  const safeFolder = folder.replaceAll("..", "").replaceAll(/[^a-zA-Z0-9/_-]/g, "");
  const dir = join(uploadRoot(), safeFolder);
  await mkdir(dir, { recursive: true });
  const name = `${Date.now()}-${randomBytes(4).toString("hex")}.${ext}`;
  await writeFile(join(dir, name), Buffer.from(await file.arrayBuffer()));
  return `/uploads/${safeFolder}/${name}`.replaceAll(/\/{2,}/g, "/");
}

export async function readUploadFile(url: string): Promise<Buffer | null> {
  const relative = safeUploadRelative(url);
  if (!relative) return null;
  try {
    return await readFile(join(uploadRoot(), relative));
  } catch {
    return null;
  }
}

export function safeUploadRelative(url: string): string | null {
  if (!url.startsWith("/uploads/")) return null;
  const relative = url.replace(/^\/uploads\/+/, "").replaceAll("..", "");
  const resolved = normalize(join(uploadRoot(), relative));
  const root = normalize(uploadRoot()) + sep;
  if (!resolved.startsWith(root) && resolved !== normalize(uploadRoot())) {
    return null;
  }
  return relative;
}
