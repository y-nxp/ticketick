"use client";

import * as React from "react";
import { useLocale } from "next-intl";
import { Globe, Check } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { locales, localeLabels, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export function LanguageSwitcher() {
  const locale = useLocale();
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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Language"
        className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium hover:bg-secondary/70 transition-colors"
      >
        <Globe className="size-4" />
        <span className="uppercase">{locale}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-44 overflow-hidden rounded-2xl border border-border bg-popover p-1.5 shadow-lg z-50">
          {locales.map((l) => (
            <button
              key={l}
              onClick={() => switchTo(l)}
              className={cn(
                "flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm hover:bg-secondary transition-colors",
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
