"use client";

import { useTranslations } from "next-intl";
import { CalendarDays } from "lucide-react";
import { cn, formatDate, formatPrice } from "@/lib/utils";
import {
  isSessionSoldOut,
  sessionMinPriceCents,
  t,
  type SessionItem,
} from "@/lib/types";

/**
 * Choix de la séance. Masqué quand l'événement n'a qu'une date : dans ce cas
 * l'utilisateur n'a rien à décider.
 */
export function SessionPicker({
  sessions,
  selectedId,
  onSelect,
  locale,
}: {
  sessions: SessionItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  locale: string;
}) {
  const te = useTranslations("event");
  if (sessions.length <= 1) return null;

  return (
    <div
      id="session-picker"
      className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <h3 className="flex items-center gap-2 text-lg font-semibold">
        <CalendarDays className="size-5 text-primary" />
        {te("selectSession")}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {te("sessionCount", { count: sessions.length })}
      </p>

      <div className="mt-4 space-y-2">
        {sessions.map((s) => {
          const soldOut = isSessionSoldOut(s);
          const selected = s.id === selectedId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              aria-pressed={selected}
              className={cn(
                "flex w-full flex-col gap-2 rounded-xl border p-3 text-left transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-3",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-secondary",
                soldOut && "opacity-60",
              )}
            >
              <span className="min-w-0">
                <span className="block font-medium">
                  {formatDate(s.startsAt, `${locale}-CH`)}
                </span>
                {s.label ? (
                  <span
                    className={cn(
                      "block text-sm",
                      selected
                        ? "text-primary-foreground/85"
                        : "text-muted-foreground",
                    )}
                  >
                    {t(s.label, locale)}
                  </span>
                ) : null}
                {s.venue ? (
                  <span
                    className={cn(
                      "block text-sm",
                      selected
                        ? "text-primary-foreground/85"
                        : "text-muted-foreground",
                    )}
                  >
                    {s.venue.city
                      ? `${s.venue.name}, ${s.venue.city}`
                      : s.venue.name}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-sm font-semibold">
                {soldOut
                  ? te("soldOut")
                  : `${te("from")} ${formatPrice(sessionMinPriceCents(s), `${locale}-CH`)}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
