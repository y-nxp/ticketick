import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * API partenaire (SAV téléphonique de Clouboard) : signature des requêtes,
 * masquage et mise en forme. Sans accès base, pour être testé seul.
 */

export const PARTNER_LOCALES = ["fr", "en", "de"] as const;
export type PartnerLocale = (typeof PARTNER_LOCALES)[number];

/** Fenêtre d'acceptation d'une signature, de part et d'autre de l'heure du serveur. */
export const SIGNATURE_WINDOW_MS = 5 * 60_000;

export function partnerLocale(value: string | null | undefined): PartnerLocale {
  return (PARTNER_LOCALES as readonly string[]).includes(value ?? "")
    ? (value as PartnerLocale)
    : "fr";
}

function payload(timestamp: string, method: string, path: string, body: string): string {
  return `${timestamp}.${method.toUpperCase()}.${path}.${body}`;
}

export function signPartnerRequest(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  body: string,
): string {
  return createHmac("sha256", secret).update(payload(timestamp, method, path, body)).digest("hex");
}

export type SignatureCheck = { ok: true } | { ok: false; reason: "config" | "stale" | "signature" };

export function checkPartnerSignature(input: {
  secret: string | undefined;
  timestamp: string | null;
  signature: string | null;
  method: string;
  path: string;
  body: string;
  now?: number;
}): SignatureCheck {
  const secret = input.secret?.trim();
  if (!secret || secret.length < 32) return { ok: false, reason: "config" };
  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts) || Math.abs((input.now ?? Date.now()) - ts) > SIGNATURE_WINDOW_MS) {
    return { ok: false, reason: "stale" };
  }
  const expected = Buffer.from(
    signPartnerRequest(secret, String(input.timestamp), input.method, input.path, input.body),
    "hex",
  );
  const received = Buffer.from(input.signature ?? "", "hex");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return { ok: false, reason: "signature" };
  }
  return { ok: true };
}

/** Référence dictée au téléphone : espaces, tirets et casse ignorés, préfixe TT facultatif. */
export function normalizeReference(value: string): string {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = compact.startsWith("TT") ? compact.slice(2) : compact;
  return body.length === 8 ? `TT-${body.slice(0, 4)}-${body.slice(4)}` : value.trim().toUpperCase();
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function emailsMatch(a: string, b: string): boolean {
  const x = normalizeEmail(a);
  return x.length > 0 && x === normalizeEmail(b);
}

/** « j***@gmail.com » : première lettre et domaine seulement. */
export function maskEmail(email: string): string {
  const [local, domain] = email.trim().split("@");
  if (!local || !domain) return "***";
  return `${local[0]}***@${domain}`;
}

type Translatable = Partial<Record<string, string>> | string | null | undefined;

export function pick(value: Translatable, locale: string): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return (value[locale] || value.fr || value.en || "").trim();
}

/** Texte libre ramené à une longueur raisonnable pour être lu au téléphone. */
export function plainText(value: string, max = 600): string {
  const text = value
    .replace(/<[^>]+>/g, " ")
    .replace(/[*_#>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export type SearchableEvent = {
  title: Translatable;
  subtitle?: Translatable;
  tags?: Translatable;
  organizerName: string;
  venues: string[];
  sessionStarts: Date[];
};

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function allTranslations(value: Translatable): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return Object.values(value).filter(Boolean).join(" ");
}

/** Chaque mot de la recherche doit apparaître quelque part, toutes langues confondues. */
export function matchesText(event: SearchableEvent, query: string | null | undefined): boolean {
  const words = fold(query ?? "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 2);
  if (words.length === 0) return true;
  const haystack = fold(
    [
      allTranslations(event.title),
      allTranslations(event.subtitle),
      allTranslations(event.tags),
      event.organizerName,
      ...event.venues,
    ].join(" "),
  );
  return words.every((w) => haystack.includes(w));
}

/** Date au format AAAA-MM-JJ, comparée au jour civil suisse de chaque séance. */
export function matchesDate(starts: Date[], day: string | null | undefined): boolean {
  if (!day) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  return starts.some((d) => zurichDay(d) === day);
}

export function zurichDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export type StockLine = { quantity: number; sold: number };

/** Même règle que `sessionRemaining` : stock des tarifs, plafonné par la jauge. */
export function remainingSeats(
  ticketTypes: StockLine[],
  capacity: number | null,
  sold: number,
): number {
  const byType = ticketTypes.reduce((sum, tt) => sum + Math.max(0, tt.quantity - tt.sold), 0);
  if (capacity == null) return byType;
  return Math.min(byType, Math.max(0, capacity - sold));
}

export function eventPageUrl(origin: string, locale: PartnerLocale, slug: string): string {
  return `${origin}${locale === "fr" ? "" : `/${locale}`}/events/${slug}`;
}
