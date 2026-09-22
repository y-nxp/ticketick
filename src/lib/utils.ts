import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(
  amountCents: number,
  locale: string = "fr-CH",
  currency: string = "CHF",
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amountCents / 100);
}

/**
 * Fuseau des séances. Sans lui, le rendu serveur suit l'horloge de la machine :
 * en production le conteneur est en UTC et un concert à 17:00 s'affichait 16:00.
 */
export const EVENT_TIME_ZONE = "Europe/Zurich";

export function formatDate(
  date: Date | string,
  locale: string = "fr-CH",
  options?: Intl.DateTimeFormatOptions,
) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: EVENT_TIME_ZONE,
    ...options,
  }).format(d);
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
