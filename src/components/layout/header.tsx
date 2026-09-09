"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { User, Search, Menu, X, Sparkles } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { Logo } from "./logo";
import { LanguageSwitcher } from "./language-switcher";
import { CartButton } from "./cart-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Header() {
  const t = useTranslations("nav");
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setMobileOpen(false);
    router.push(query.trim() ? `/?q=${encodeURIComponent(query.trim())}` : "/");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="container-page flex h-16 items-center gap-3">
        <Logo />

        <nav className="ml-4 hidden items-center gap-1 lg:flex">
          <Link
            href="/"
            className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary/70 hover:text-foreground transition-colors"
          >
            {t("events")}
          </Link>
          <Link
            href="/how-it-works"
            className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary/70 hover:text-foreground transition-colors"
          >
            {t("howItWorks")}
          </Link>
        </nav>

        <form
          onSubmit={onSearch}
          className="relative ml-auto hidden max-w-sm flex-1 md:block"
        >
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search")}
            className="h-10 w-full rounded-full border border-border bg-secondary/40 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:bg-background"
          />
        </form>

        <div className="ml-auto flex items-center gap-1 md:ml-2">
          <Link href="/organizer" className="hidden sm:block">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Sparkles className="size-4 text-primary" />
              {t("organizer")}
            </Button>
          </Link>

          <div className="hidden sm:block">
            <LanguageSwitcher />
          </div>

          <CartButton />

          <Link
            href="/account"
            aria-label={t("account")}
            className="inline-flex size-10 items-center justify-center rounded-full hover:bg-secondary/70 transition-colors"
          >
            <User className="size-5" />
          </Link>

          <button
            type="button"
            aria-label={t("menu")}
            onClick={() => setMobileOpen((v) => !v)}
            className="inline-flex size-10 items-center justify-center rounded-full hover:bg-secondary/70 transition-colors lg:hidden"
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      <div
        className={cn(
          "overflow-hidden border-t border-border/70 lg:hidden transition-[max-height]",
          mobileOpen ? "max-h-96" : "max-h-0 border-t-0",
        )}
      >
        <div className="container-page flex flex-col gap-2 py-4">
          <form onSubmit={onSearch} className="relative md:hidden">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search")}
              className="h-11 w-full rounded-full border border-border bg-secondary/40 pl-10 pr-4 text-sm outline-none focus:border-ring focus:bg-background"
            />
          </form>
          <Link onClick={() => setMobileOpen(false)} href="/" className="rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-secondary">
            {t("events")}
          </Link>
          <Link onClick={() => setMobileOpen(false)} href="/how-it-works" className="rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-secondary">
            {t("howItWorks")}
          </Link>
          <Link onClick={() => setMobileOpen(false)} href="/organizer" className="rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-secondary">
            {t("organizer")}
          </Link>
          <div className="pt-2">
            <LanguageSwitcher />
          </div>
        </div>
      </div>
    </header>
  );
}
