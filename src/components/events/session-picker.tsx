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
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
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
                "flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors",
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-secondary",
                soldOut && "opacity-60",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {formatDate(s.startsAt, `${locale}-CH`)}
                </span>
                <span className="block truncate text-sm text-muted-foreground">
                  {s.label ? `${t(s.label, locale)} · ` : ""}
                  {s.venue ? s.venue.name : ""}
                </span>
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
