"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Check, CreditCard, LogOut, ScanLine, Volume2, VolumeX } from "lucide-react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { localeLabels, locales, type Locale } from "@/i18n/routing";
import { TicketMark } from "@/components/ui/ticket-mark";
import { logout } from "@/lib/auth/actions";
import { clearDoorStorage, pendingTotal } from "@/lib/door/offline";
import { readSoundPref, unlockSounds, writeSoundPref } from "@/lib/door/sounds";

/** Préférence de son partagée par l'en-tête et le scanner, retenue sur l'appareil. */
const ecouteurs = new Set<() => void>();

function abonner(fn: () => void) {
  ecouteurs.add(fn);
  return () => {
    ecouteurs.delete(fn);
  };
}

export function useDoorSound(): { on: boolean; toggle: () => void } {
  const on = React.useSyncExternalStore(abonner, readSoundPref, () => true);
  const toggle = React.useCallback(() => {
    unlockSounds();
    writeSoundPref(!readSoundPref());
    ecouteurs.forEach((fn) => fn());
  }, []);
  return { on, toggle };
}

export function DoorHeader({
  sound,
  active = "door",
  till = false,
}: {
  sound?: { on: boolean; toggle: () => void };
  /** Contrôle et caisse ouverts à ce compte : onglets Contrôle / Caisse. */
  till?: boolean;
  /** Onglet ouvert : contrôle des billets ou caisse. */
  active?: "door" | "sell";
}) {
  const t = useTranslations("door");
  const tab = (on: boolean) =>
    `grid size-11 place-items-center rounded-control ${on ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/70"}`;
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-lg items-center gap-2 px-4">
        <h1 className="flex flex-1 items-center gap-2 text-lg font-bold tracking-tight">
          <TicketMark className="h-6" />
          {active === "sell" ? t("sell.title") : t("title")}
        </h1>
        {till ? (
          <>
            <Link href="/door" aria-label={t("title")} title={t("title")} aria-current={active === "door" ? "page" : undefined} className={tab(active === "door")}>
              <ScanLine className="size-5" />
            </Link>
            <Link href="/door/sell" aria-label={t("sell.title")} title={t("sell.title")} aria-current={active === "sell" ? "page" : undefined} className={tab(active === "sell")}>
              <CreditCard className="size-5" />
            </Link>
          </>
        ) : null}
        {sound ? (
          <button
            type="button"
            onClick={sound.toggle}
            aria-pressed={sound.on}
            aria-label={sound.on ? t("soundOn") : t("soundOff")}
            title={sound.on ? t("soundOn") : t("soundOff")}
            className="grid size-11 place-items-center rounded-control text-muted-foreground hover:bg-secondary/70"
          >
            {sound.on ? <Volume2 className="size-5" /> : <VolumeX className="size-5 text-destructive" />}
          </button>
        ) : null}
        <DoorLanguage />
        <form
          action={logout}
          onSubmit={(e) => {
            // Les entrées pas encore envoyées seraient perdues ; la liste des
            // billets (noms des acheteurs) ne reste pas sur le téléphone.
            const n = pendingTotal();
            if (n > 0 && !window.confirm(t("logoutPending", { count: n }))) {
              e.preventDefault();
              return;
            }
            clearDoorStorage("none", true);
          }}
        >
          <button
            type="submit"
            aria-label={t("logout")}
            title={t("logout")}
            className="grid size-11 place-items-center rounded-control text-muted-foreground hover:bg-secondary/70"
          >
            <LogOut className="size-5" />
          </button>
        </form>
      </div>
    </header>
  );
}

/**
 * Langue de l'app d'entrée. Installée sur l'écran d'accueil, elle n'a pas de
 * barre d'adresse : c'est le seul moyen d'en changer. Le concert choisi
 * (`?s=…`) est gardé.
 */
function DoorLanguage() {
  const locale = useLocale();
  const t = useTranslations("nav");
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const choose = (next: Locale) => {
    setOpen(false);
    if (next === locale) return;
    const query = Object.fromEntries(search.entries());
    router.replace({ pathname, query }, { locale: next });
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t("language")}
        title={t("language")}
        className="grid size-11 place-items-center rounded-control text-sm font-semibold uppercase text-muted-foreground hover:bg-secondary/70"
      >
        {locale}
      </button>
      {open ? (
        <ul className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-card border border-border bg-popover p-1.5 shadow-lg">
          {locales.map((l) => (
            <li key={l}>
              <button
                type="button"
                lang={l}
                onClick={() => choose(l)}
                className="flex w-full items-center justify-between rounded-control px-3 py-2.5 text-sm hover:bg-secondary"
              >
                <span className="flex items-center gap-2">
                  <span className="w-6 text-xs uppercase text-muted-foreground">{l}</span>
                  {localeLabels[l]}
                </span>
                {l === locale ? <Check className="size-4 text-primary" /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Conseil d'installation, masqué quand l'app est ouverte depuis l'écran d'accueil. */
export function InstallHint() {
  const t = useTranslations("door");
  const installee = React.useSyncExternalStore(
    () => () => undefined,
    () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    () => true,
  );
  if (installee) return null;
  return (
    <p className="mt-auto pt-2 text-center text-xs text-muted-foreground">{t("installHint")}</p>
  );
}
