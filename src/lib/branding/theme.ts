import type { CSSProperties } from "react";
import type {
  OrganizerBrand,
  OrganizerNavLink,
  OrganizerScheme,
} from "@/lib/types";

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

export function parseOrganizerScheme(
  value: string | null | undefined,
): OrganizerScheme {
  return value === "dark" ? "dark" : "light";
}

export function organizerBrandFromRow(row: {
  brandPrimary?: string | null;
  brandAccent?: string | null;
  brandBg?: string | null;
  brandScheme?: string | null;
  navLinks?: unknown;
}): OrganizerBrand {
  return {
    primary: parseHexColor(row.brandPrimary ?? undefined),
    accent: parseHexColor(row.brandAccent ?? undefined),
    background: parseHexColor(row.brandBg ?? undefined),
    scheme: parseOrganizerScheme(row.brandScheme),
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
  const accent = brand.accent ?? primary;
  const dark = brand.scheme === "dark";
  const background = brand.background ?? (dark ? "#1E1F23" : "#FFFFFF");
  const ink = dark ? "#FFFFFF" : "#2A2C30";
  const surface = dark ? "#2A2C30" : "#FFFFFF";
  const muted = dark ? "#32353B" : "#F8F9FA";
  const line = dark ? "#3A3D44" : "#E6E8EB";
  return {
    ["--primary" as string]: primary,
    ["--primary-foreground" as string]: "#FFFFFF",
    ["--primary-hover" as string]: primary,
    ["--ring" as string]: primary,
    ["--background" as string]: background,
    ["--foreground" as string]: ink,
    ["--card" as string]: surface,
    ["--card-foreground" as string]: ink,
    ["--popover" as string]: surface,
    ["--popover-foreground" as string]: ink,
    ["--secondary" as string]: muted,
    ["--secondary-foreground" as string]: ink,
    ["--muted" as string]: muted,
    ["--muted-foreground" as string]: dark ? "#A7ABB4" : "#6B6E76",
    ["--accent" as string]: dark ? "#332F5C" : "#EEECFD",
    ["--accent-foreground" as string]: dark ? "#CFC9FB" : "#4B3FC4",
    ["--border" as string]: line,
    ["--input" as string]: line,
    ["--brand-accent" as string]: accent,
    colorScheme: dark ? "dark" : "light",
    backgroundColor: background,
    color: ink,
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
