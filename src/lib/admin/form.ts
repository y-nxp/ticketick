import "server-only";

import * as z from "zod";
import type { FormState } from "./types";

export type { FormState } from "./types";

/**
 * Outils communs aux formulaires du backoffice.
 *
 * Les actions renvoient toutes la même forme : une clé d'erreur, jamais une
 * phrase. Le libellé est choisi côté composant, sinon les messages du
 * backoffice n'existeraient qu'en français.
 */

export function failure(error: string): FormState {
  return { ok: false, error };
}

export function success(id?: string): FormState {
  return { ok: true, id };
}

/**
 * Champ traduit `{ fr, en, de, it }`.
 *
 * Seul le français est exigé : `t()` retombe dessus quand une langue manque,
 * si bien qu'imposer les quatre saisies ne protégerait de rien et alourdirait
 * chaque création.
 */
export const translatedSchema = z.object({
  fr: z.string().trim().min(1).max(300),
  en: z.string().trim().max(300).optional(),
  de: z.string().trim().max(300).optional(),
  it: z.string().trim().max(300).optional(),
});

export type Translated = z.infer<typeof translatedSchema>;

/** Recompose un champ traduit à partir de `titre.fr`, `titre.en`… */
export function readTranslated(
  data: FormData,
  prefix: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const locale of ["fr", "en", "de", "it"]) {
    const value = data.get(`${prefix}.${locale}`);
    if (typeof value === "string" && value.trim()) {
      out[locale] = value.trim();
    }
  }
  return out;
}

export function readText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function readOptionalText(
  data: FormData,
  name: string,
): string | undefined {
  const value = readText(data, name);
  return value === "" ? undefined : value;
}

export function readBoolean(data: FormData, name: string): boolean {
  return data.get(name) === "on" || data.get(name) === "true";
}

/**
 * Montant saisi en francs, stocké en centimes.
 *
 * `Math.round` sur le produit plutôt qu'un simple cast : 35.35 × 100 vaut
 * 3534.9999… en virgule flottante, et tronquer perdrait un centime.
 */
export function readMoneyCents(data: FormData, name: string): number | null {
  const raw = readText(data, name).replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  return Math.round(Number(raw) * 100);
}

export function readInteger(data: FormData, name: string): number | null {
  const raw = readText(data, name);
  if (!/^\d+$/.test(raw)) return null;
  return Number(raw);
}

/**
 * Instant saisi dans un champ `datetime-local`.
 *
 * Le navigateur envoie une heure sans fuseau (« 2026-11-04T20:00 »).
 * `new Date()` l'interpréterait dans le fuseau du serveur : sur gb10, réglé en
 * UTC, une représentation annoncée à 20 h se retrouverait à 22 h à l'affichage
 * suisse. L'heure est donc rattachée explicitement à Europe/Zurich.
 */
export function readDateTime(data: FormData, name: string): Date | null {
  const raw = readText(data, name);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return null;
  return zurichToUtc(raw);
}

export function readOptionalDateTime(
  data: FormData,
  name: string,
): Date | null | undefined {
  const raw = readText(data, name);
  if (raw === "") return undefined;
  return readDateTime(data, name);
}

/**
 * Convertit une heure locale suisse en instant absolu.
 *
 * Le décalage varie selon l'heure d'été : il est mesuré à la date visée plutôt
 * que supposé constant, faute de quoi les séances d'hiver seraient décalées
 * d'une heure.
 */
function zurichToUtc(local: string): Date {
  const presume = new Date(`${local}:00Z`);
  const offset = zurichOffsetMs(presume);
  // Deuxième passe : près d'un changement d'heure, le décalage retenu peut
  // être celui de l'autre côté de la bascule.
  return new Date(
    presume.getTime() - zurichOffsetMs(new Date(presume.getTime() - offset)),
  );
}

function zurichOffsetMs(instant: Date): number {
  const zurich = new Date(
    instant.toLocaleString("en-US", { timeZone: "Europe/Zurich" }),
  );
  const utc = new Date(instant.toLocaleString("en-US", { timeZone: "UTC" }));
  return zurich.getTime() - utc.getTime();
}

/**
 * Identifiant d'adresse dérivé d'un titre.
 *
 * Les diacritiques sont décomposés puis retirés : « Théâtre » donnerait
 * autrement « th-tre ».
 */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
