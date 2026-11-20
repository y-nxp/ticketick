"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { Globe, Check } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { locales, localeLabels, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * `inline` : les langues côte à côte, sans liste déroulante. Pour le menu
 * mobile, qui masque ce qui déborde (`overflow-hidden`) : une liste ouverte
 * y serait coupée et impossible à toucher.
 */
export function LanguageSwitcher({ variant = "menu" }: { variant?: "menu" | "inline" }) {
  const locale = useLocale();
  const t = useTranslations("nav");
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function switchTo(next: Locale) {
    setOpen(false);
    router.replace(pathname, { locale: next });
  }

  if (variant === "inline") {
    return (
      <div role="group" aria-label={t("language")} className="flex flex-wrap items-center gap-1">
        <Globe className="mr-1 size-4 text-muted-foreground" aria-hidden />
        {locales.map((l) => (
          <button
            key={l}
            type="button"
            lang={l}
            onClick={() => switchTo(l)}
            aria-current={l === locale ? "true" : undefined}
            aria-label={localeLabels[l]}
            title={localeLabels[l]}
            className={cn(
              "h-10 min-w-10 rounded-full px-2.5 text-sm font-medium uppercase transition-colors",
              l === locale ? "bg-primary text-primary-foreground" : "hover:bg-secondary",
            )}
          >
            {l}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("language")}
        className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium hover:bg-secondary/70 transition-colors"
      >
        <Globe className="size-4" />
        <span className="uppercase">{locale}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-44 overflow-hidden rounded-card border border-border bg-popover p-1.5 shadow-lg z-50">
          {locales.map((l) => (
            <button
              key={l}
              onClick={() => switchTo(l)}
              className={cn(
                "flex w-full items-center justify-between rounded-control px-3 py-2 text-sm hover:bg-secondary transition-colors",
                l === locale && "font-semibold",
              )}
            >
              <span className="flex items-center gap-2">
                <span className="uppercase text-xs text-muted-foreground w-6">
                  {l}
                </span>
                {localeLabels[l]}
              </span>
              {l === locale && <Check className="size-4 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
