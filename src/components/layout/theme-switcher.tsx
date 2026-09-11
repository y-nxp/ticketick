"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEME_STORAGE_KEY } from "./theme";

/**
 * Bascule clair / sombre.
 *
 * Le thème vit uniquement dans la classe `dark` de <html>, posée avant le
 * premier rendu par `themeInitScript`. Icônes et libellés sont donc permutés
 * en CSS : aucun état React, aucun écart d'hydratation, aucun re-rendu.
 */
export function ThemeSwitcher({ className }: { className?: string }) {
  const t = useTranslations("nav");

  // Tant que l'utilisateur n'a pas choisi explicitement, on suit le système.
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      if (localStorage.getItem(THEME_STORAGE_KEY)) return;
      document.documentElement.classList.toggle("dark", e.matches);
      document.documentElement.style.colorScheme = e.matches ? "dark" : "light";
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function toggle() {
    const root = document.documentElement;
    const next = root.classList.contains("dark") ? "light" : "dark";
    root.classList.toggle("dark", next === "dark");
    root.style.colorScheme = next;
    localStorage.setItem(THEME_STORAGE_KEY, next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "inline-flex size-10 items-center justify-center rounded-full transition-colors hover:bg-secondary/70",
        className,
      )}
    >
      <Moon className="size-5 dark:hidden" />
      <Sun className="hidden size-5 dark:block" />
      {/* Le libellé accessible suit le thème sans JavaScript. */}
      <span className="sr-only dark:hidden">{t("themeDark")}</span>
      <span className="sr-only hidden dark:inline">{t("themeLight")}</span>
    </button>
  );
}
