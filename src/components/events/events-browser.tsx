"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { EventCard } from "./event-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { minPriceCents, t, type Category, type EventItem } from "@/lib/types";

type DateFilter = "any" | "today" | "week" | "weekend" | "month";
type SortKey = "date" | "priceAsc" | "priceDesc" | "name";

export function EventsBrowser({
  events,
  categories,
  cities,
  locale,
  initialQuery = "",
}: {
  events: EventItem[];
  categories: Category[];
  cities: string[];
  locale: string;
  initialQuery?: string;
}) {
  const tf = useTranslations("filters");
  const th = useTranslations("home");
  const te = useTranslations("event");

  const [query, setQuery] = React.useState(initialQuery);
  const [category, setCategory] = React.useState<string>("all");
  const [city, setCity] = React.useState<string>("all");
  const [dateFilter, setDateFilter] = React.useState<DateFilter>("any");
  const [sort, setSort] = React.useState<SortKey>("date");
  const [showFilters, setShowFilters] = React.useState(false);

  const filtered = React.useMemo(() => {
    const now = new Date();
    let list = events.slice();

    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (e) =>
          t(e.title, locale).toLowerCase().includes(q) ||
          e.venue.city.toLowerCase().includes(q) ||
          e.venue.name.toLowerCase().includes(q) ||
          e.organizer.name.toLowerCase().includes(q) ||
          e.categories.some((c) => t(c.name, locale).toLowerCase().includes(q)),
      );
    }

    if (category !== "all") {
      list = list.filter((e) => e.categories.some((c) => c.slug === category));
    }

    if (city !== "all") {
      list = list.filter((e) => e.venue.city === city);
    }

    if (dateFilter !== "any") {
      list = list.filter((e) => {
        const d = new Date(e.startsAt);
        if (dateFilter === "today") {
          return d.toDateString() === now.toDateString();
        }
        if (dateFilter === "week") {
          const in7 = new Date(now);
          in7.setDate(in7.getDate() + 7);
          return d >= now && d <= in7;
        }
        if (dateFilter === "weekend") {
          const day = d.getDay();
          const in7 = new Date(now);
          in7.setDate(in7.getDate() + 7);
          return (day === 5 || day === 6 || day === 0) && d >= now && d <= in7;
        }
        if (dateFilter === "month") {
          return (
            d.getMonth() === now.getMonth() &&
            d.getFullYear() === now.getFullYear()
          );
        }
        return true;
      });
    }

    list.sort((a, b) => {
      switch (sort) {
        case "priceAsc":
          return minPriceCents(a) - minPriceCents(b);
        case "priceDesc":
          return minPriceCents(b) - minPriceCents(a);
        case "name":
          return t(a.title, locale).localeCompare(t(b.title, locale));
        default:
          return +new Date(a.startsAt) - +new Date(b.startsAt);
      }
    });

    return list;
  }, [events, query, category, city, dateFilter, sort, locale]);

  const hasActiveFilters =
    query.trim() !== "" ||
    category !== "all" ||
    city !== "all" ||
    dateFilter !== "any";

  function reset() {
    setQuery("");
    setCategory("all");
    setCity("all");
    setDateFilter("any");
    setSort("date");
  }

  return (
    <div>
      {/* Barre de catégories */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <CategoryPill
          active={category === "all"}
          onClick={() => setCategory("all")}
          label={tf("allCategories")}
        />
        {categories.map((c) => (
          <CategoryPill
            key={c.id}
            active={category === c.slug}
            onClick={() => setCategory(c.slug)}
            label={t(c.name, locale)}
            color={c.color}
          />
        ))}
      </div>

      {/* Recherche + toggle filtres */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tf("search")}
            className="h-12 w-full rounded-full border border-border bg-card pl-11 pr-4 text-sm outline-none focus:border-ring"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 hover:bg-secondary"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <Button
          variant="outline"
          size="lg"
          onClick={() => setShowFilters((v) => !v)}
          className={cn(showFilters && "border-primary text-primary")}
        >
          <SlidersHorizontal className="size-4" />
          {tf("title")}
        </Button>
      </div>

      {/* Filtres détaillés */}
      {showFilters && (
        <div className="mt-4 grid gap-4 rounded-2xl border border-border bg-card p-4 sm:grid-cols-3">
          <Field label={tf("city")}>
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
            >
              <option value="all">{tf("allCities")}</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label={tf("date")}>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as DateFilter)}
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
            >
              <option value="any">{tf("anyDate")}</option>
              <option value="today">{tf("today")}</option>
              <option value="week">{tf("thisWeek")}</option>
              <option value="weekend">{tf("thisWeekend")}</option>
              <option value="month">{tf("thisMonth")}</option>
            </select>
          </Field>
          <Field label={tf("sortBy")}>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
            >
              <option value="date">{tf("sortDate")}</option>
              <option value="priceAsc">{tf("sortPriceAsc")}</option>
              <option value="priceDesc">{tf("sortPriceDesc")}</option>
              <option value="name">{tf("sortName")}</option>
            </select>
          </Field>
        </div>
      )}

      {/* En-tête résultats */}
      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {th("resultsCount", { count: filtered.length })}
        </p>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={reset}>
            <X className="size-4" />
            {tf("reset")}
          </Button>
        )}
      </div>

      {/* Grille */}
      {filtered.length > 0 ? (
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              locale={locale}
              labels={{ from: te("from"), soldOut: te("soldOut") }}
            />
          ))}
        </div>
      ) : (
        <div className="mt-10 rounded-2xl border border-dashed border-border py-16 text-center">
          <p className="font-medium">{th("noResults")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {th("noResultsHint")}
          </p>
          <Button variant="outline" className="mt-4" onClick={reset}>
            {tf("reset")}
          </Button>
        </div>
      )}
    </div>
  );
}

function CategoryPill({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card hover:bg-secondary",
      )}
    >
      {color && (
        <span
          className="size-2 rounded-full"
          style={{ backgroundColor: active ? "currentColor" : color }}
        />
      )}
      {label}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
