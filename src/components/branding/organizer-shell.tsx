"use client";

import * as React from "react";
import { Lora, Open_Sans } from "next/font/google";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { organizerThemeStyle } from "@/lib/branding/theme";
import type { Organizer } from "@/lib/types";

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

const openSans = Open_Sans({
  subsets: ["latin"],
  variable: "--font-organizer",
  display: "swap",
});

/**
 * Habillage d'une page ticketick aux couleurs du site client.
 *
 * Le menu pointe vers leur vrai site : on n'héberge pas leurs contenus,
 * seulement la billetterie, dans une page qui leur ressemble.
 */
export function OrganizerShell({
  organizer,
  children,
}: {
  organizer: Organizer;
  children: React.ReactNode;
}) {
  const t = useTranslations("portal");
  const [open, setOpen] = React.useState(false);
  const nav = organizer.brand.nav;
  const site = organizer.website;

  return (
    <div
      className={`organizer-theme ${lora.variable} ${openSans.variable} flex min-h-full flex-col`}
      style={organizerThemeStyle(organizer.brand)}
    >
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-4 sm:px-6">
          <a
            href={site ?? undefined}
            className="flex min-w-0 items-center gap-3"
            {...(site ? { target: "_blank", rel: "noreferrer" } : {})}
            onClick={site ? undefined : (e) => e.preventDefault()}
          >
            {organizer.logoUrl ? (
              <img
                src={organizer.logoUrl}
                alt=""
                width={56}
                height={56}
                className="size-14 rounded-full object-cover"
              />
            ) : null}
            <span className="organizer-wordmark truncate text-lg sm:text-xl">
              {organizer.name}
            </span>
          </a>

          <nav className="ml-auto hidden items-center gap-1 lg:flex">
            {nav.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-full px-3 py-2 text-xs font-medium uppercase tracking-[0.14em] text-neutral-600 hover:text-[var(--brand-accent)]"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {nav.length > 0 ? (
            <button
              type="button"
              className="ml-auto grid size-10 place-items-center rounded-full border border-black/10 lg:hidden"
              aria-expanded={open}
              aria-label={open ? t("closeMenu") : t("openMenu")}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          ) : null}
        </div>

        {open && nav.length > 0 ? (
          <nav className="border-t border-black/5 px-4 py-3 lg:hidden">
            <ul className="space-y-1">
              {nav.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="block rounded-lg px-3 py-2 text-sm uppercase tracking-wider text-neutral-700"
                    onClick={() => setOpen(false)}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </header>

      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </div>

      <footer className="mt-auto border-t border-black/5 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-neutral-500 sm:px-6">
          <p>
            {site ? (
              <a href={site} className="hover:text-[var(--brand-accent)]">
                {organizer.name}
              </a>
            ) : (
              organizer.name
            )}
          </p>
          <p>
            <Link href="/" className="hover:text-[var(--brand-accent)]">
              {t("poweredBy")}
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
