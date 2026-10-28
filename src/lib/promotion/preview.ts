import { channelNeedsImage, type PromotionChannel } from "./channels";

/**
 * Avertissements des aperçus « tel que sur Facebook / Instagram »
 * (docs/module-promotion.md, § 2.4). Ils renseignent, ils ne bloquent pas :
 * seules les limites dures (`INSTAGRAM_CAPTION_MAX`, image exigée) sont
 * refusées par le serveur.
 */

/** Légende Instagram : longueur maximale. */
export const INSTAGRAM_CAPTION_MAX = 2200;
/** Texte d'une publication Facebook : plafond que nous nous fixons. */
export const FACEBOOK_MESSAGE_MAX = 5000;
/** Instagram coupe la légende du fil vers 125 caractères (« … plus »). */
export const INSTAGRAM_FOLD = 125;
/** Facebook replie le texte vers 480 caractères (« Voir plus »). */
export const FACEBOOK_FOLD = 480;
/** Plus de lignes que cela : repli « Voir plus » sur Facebook, même court. */
export const FACEBOOK_FOLD_LINES = 7;
/** Rapports largeur/hauteur affichés sans recadrage dans le fil Instagram. */
export const INSTAGRAM_RATIO_MIN = 4 / 5;
export const INSTAGRAM_RATIO_MAX = 1.91;

export type PreviewWarning =
  /** Le lien d'une légende Instagram ne se clique pas (§ 5.4). */
  | "linkNotClickable"
  | "truncated"
  | "tooLong"
  | "tooManyHashtags"
  | "imageRequired"
  | "imageCropped";

export function messageLimit(channel: PromotionChannel): number {
  return channel === "instagram" ? INSTAGRAM_CAPTION_MAX : FACEBOOK_MESSAGE_MAX;
}

/** Fin du texte visible avant le repli, en caractères. */
export function foldAt(channel: PromotionChannel, message: string): number | null {
  if (channel === "instagram") return message.length > INSTAGRAM_FOLD ? INSTAGRAM_FOLD : null;
  if (message.length > FACEBOOK_FOLD) return FACEBOOK_FOLD;
  const lines = message.split("\n");
  if (lines.length > FACEBOOK_FOLD_LINES) {
    return lines.slice(0, FACEBOOK_FOLD_LINES).join("\n").length;
  }
  return null;
}

export function countHashtags(message: string): number {
  return message.match(/(^|\s)#[\p{L}\p{N}_]+/gu)?.length ?? 0;
}

export interface PreviewInput {
  channel: PromotionChannel;
  message: string;
  hasImage: boolean;
  /** Largeur / hauteur de l'image, une fois chargée par le navigateur. */
  imageRatio?: number | null;
}

export function previewWarnings(input: PreviewInput): PreviewWarning[] {
  const { channel, message } = input;
  const warnings: PreviewWarning[] = [];
  if (channel === "instagram") warnings.push("linkNotClickable");
  if (message.length > messageLimit(channel)) warnings.push("tooLong");
  else if (foldAt(channel, message) !== null) warnings.push("truncated");
  if (channel === "instagram" && countHashtags(message) > 30) warnings.push("tooManyHashtags");
  if (!input.hasImage && channelNeedsImage(channel)) warnings.push("imageRequired");
  if (
    input.hasImage &&
    input.imageRatio &&
    (input.imageRatio < INSTAGRAM_RATIO_MIN - 0.01 || input.imageRatio > INSTAGRAM_RATIO_MAX + 0.01)
  ) {
    warnings.push("imageCropped");
  }
  return warnings;
}
