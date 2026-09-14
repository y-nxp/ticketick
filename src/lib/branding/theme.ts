import type { CSSProperties } from "react";
import type { OrganizerBrand, OrganizerNavLink } from "@/lib/types";

const HEX = /^#[0-9a-fA-F]{6}$/;

export function parseHexColor(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && HEX.test(trimmed) ? trimmed : undefined;
}

export function parseNavLinks(value: unknown): OrganizerNavLink[] {
  if (!Array.isArray(value)) return [];
  const links: OrganizerNavLink[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const label = "label" in item ? String(item.label).trim() : "";
    const href = "href" in item ? String(item.href).trim() : "";
    if (!label || !href || !isHttpUrl(href)) continue;
    links.push({ label, href });
  }
  return links;
}

/** Une ligne du formulaire admin : `Accueil | https://exemple.ch`. */
export function parseNavLinksText(text: string): OrganizerNavLink[] {
  return text
    .split(/\n/)
    .map((line) => {
      const cut = line.indexOf("|");
      if (cut < 0) return null;
      const label = line.slice(0, cut).trim();
      const href = line.slice(cut + 1).trim();
      if (!label || !isHttpUrl(href)) return null;
      return { label, href };
    })
    .filter((link): link is OrganizerNavLink => link != null);
}

export function serializeNavLinks(links: OrganizerNavLink[]): string {
  return links.map((link) => `${link.label} | ${link.href}`).join("\n");
}

export function organizerBrandFromRow(row: {
  brandPrimary?: string | null;
  brandAccent?: string | null;
  brandBg?: string | null;
  navLinks?: unknown;
}): OrganizerBrand {
  return {
    primary: parseHexColor(row.brandPrimary ?? undefined),
    accent: parseHexColor(row.brandAccent ?? undefined),
    background: parseHexColor(row.brandBg ?? undefined),
    nav: parseNavLinks(row.navLinks),
  };
}

export function hasCustomBrand(brand: OrganizerBrand): boolean {
  return Boolean(brand.primary || brand.accent || brand.background || brand.nav.length);
}

/**
 * Recolore le design system sur la page hébergée : les boutons « Réserver »
 * suivent la charte de l'organisateur plutôt que le violet ticketick.
 */
export function organizerThemeStyle(brand: OrganizerBrand): CSSProperties {
  const primary = brand.primary ?? "#6C5CE7";
  const background = brand.background ?? "#FFFFFF";
  const accent = brand.accent ?? primary;
  return {
    ["--primary" as string]: primary,
    ["--primary-foreground" as string]: "#FFFFFF",
    ["--primary-hover" as string]: primary,
    ["--ring" as string]: primary,
    ["--background" as string]: background,
    ["--foreground" as string]: "#2A2C30",
    ["--card" as string]: "#FFFFFF",
    ["--card-foreground" as string]: "#2A2C30",
    ["--brand-accent" as string]: accent,
    colorScheme: "light",
    backgroundColor: background,
    color: "#2A2C30",
  };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
