import { z } from "zod";

/**
 * Outils de mesure d'un organisateur, déclenchés sur ses seuls événements.
 * Ces identifiants sont publics par nature : ils figurent dans le code des pages.
 */
export interface OrganizerTags {
  metaPixelId?: string;
  ga4Id?: string;
}

export const META_PIXEL_PATTERN = /^\d{8,20}$/;
export const GA4_ID_PATTERN = /^G-[A-Z0-9]{4,20}$/;

/** Saisie de l'admin : vide efface, mal formé est refusé. */
export const organizerTagsInput = z.object({
  metaPixelId: z
    .string()
    .trim()
    .transform((v) => v || null)
    .refine((v) => v === null || META_PIXEL_PATTERN.test(v), "metaPixelInvalid"),
  ga4MeasurementId: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase() || null)
    .refine((v) => v === null || GA4_ID_PATTERN.test(v), "ga4IdInvalid"),
});

/** Ligne de la base vers les identifiants utilisables, revalidés à la lecture. */
export function organizerTagsFromRow(row: {
  metaPixelId: string | null;
  ga4MeasurementId: string | null;
}): OrganizerTags {
  const tags: OrganizerTags = {};
  if (row.metaPixelId && META_PIXEL_PATTERN.test(row.metaPixelId)) tags.metaPixelId = row.metaPixelId;
  if (row.ga4MeasurementId && GA4_ID_PATTERN.test(row.ga4MeasurementId)) tags.ga4Id = row.ga4MeasurementId;
  return tags;
}
