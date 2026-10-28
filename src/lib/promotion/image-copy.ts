/**
 * Copie figée du visuel d'une publication (docs/module-promotion.md, § 3.5) :
 * à la validation, l'image choisie est recopiée sous
 * `/uploads/promotion/{organizerId}/…`. Si l'organisateur change ensuite
 * l'affiche de l'événement, la publication programmée garde ce qu'il a
 * validé. Le dossier reste servi par la route `/uploads`, donc public, comme
 * Instagram l'exige au moment de publier.
 *
 * Aucun appel réseau : seule une image déjà déposée sur ticketick se copie.
 * Le stockage est passé en paramètre (`readUploadFile` / `saveUploadedImage`
 * de `src/lib/uploads.ts` dans l'application), ce qui laisse les tests
 * tourner sur un dossier temporaire.
 */

export interface ImageStore {
  read(url: string): Promise<Buffer | null>;
  save(file: File, folder: string): Promise<string | null>;
}

export type ImageCopyErrorKey =
  /** Adresse hors de `/uploads/` : on ne va rien chercher sur Internet. */
  | "imageExternal"
  | "imageMissing"
  | "imageUnsupported";

export class ImageCopyError extends Error {
  constructor(readonly key: ImageCopyErrorKey) {
    super(key);
  }
}

/** Type réel d'après les premiers octets, sans se fier à l'extension. */
export function imageMime(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  const at = (i: number) => bytes[i];
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return "image/png";
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

export function promotionImageFolder(organizerId: string): string {
  return `promotion/${organizerId}`;
}

/** Recopie `source` et renvoie le chemin public de la copie. */
export async function freezePromotionImage(
  store: ImageStore,
  source: string,
  organizerId: string,
): Promise<string> {
  if (!source.startsWith("/uploads/")) throw new ImageCopyError("imageExternal");
  const bytes = await store.read(source);
  if (!bytes || bytes.length === 0) throw new ImageCopyError("imageMissing");
  const type = imageMime(bytes);
  if (!type) throw new ImageCopyError("imageUnsupported");

  const name = source.split("/").pop() || "visuel";
  const file = new File([new Uint8Array(bytes)], name, { type });
  const saved = await store.save(file, promotionImageFolder(organizerId));
  if (!saved) throw new ImageCopyError("imageMissing");
  return saved;
}
