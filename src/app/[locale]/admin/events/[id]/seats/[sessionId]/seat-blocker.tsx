"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SeatMap, type SeatState } from "@/components/seating/seat-map";
import { setSeatsBlocked } from "@/lib/admin/seat-actions";
import type { FormState } from "@/lib/admin/types";
import { seatLabel, type SeatLayout } from "@/lib/seating/layout";

interface SeatRow {
  key: string;
  status: "AVAILABLE" | "RESERVED" | "BLOCKED";
  note: string | null;
  reference: string | null;
}

export function SeatBlocker({
  eventId,
  sessionId,
  locale,
  layout,
  seats,
}: {
  eventId: string;
  sessionId: string;
  locale: string;
  layout: SeatLayout;
  seats: SeatRow[];
}) {
  const t = useTranslations("admin.seats");
  const [picked, setPicked] = React.useState<string[]>([]);
  const [note, setNote] = React.useState("");
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const result = await setSeatsBlocked(prev, formData);
      if (result?.ok) setPicked([]);
      return result;
    },
    undefined,
  );

  const byKey = new Map(seats.map((s) => [s.key, s]));
  const pickedFree = picked.filter((k) => byKey.get(k)?.status === "AVAILABLE");
  const pickedBlocked = picked.filter((k) => byKey.get(k)?.status === "BLOCKED");
  const blocked = seats.filter((s) => s.status === "BLOCKED");

  function stateOf(key: string): SeatState {
    if (picked.includes(key)) return "selected";
    const seat = byKey.get(key);
    if (!seat) return "off";
    if (seat.status === "BLOCKED") return "blocked";
    if (seat.status === "RESERVED") return "taken";
    return "free";
  }

  function toggle(key: string) {
    setPicked((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <SeatMap layout={layout} locale={locale} stateOf={stateOf} onToggle={toggle} />

      <div className="space-y-5">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">{t("selection", { count: picked.length })}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>
          <ul className="mt-3 space-y-1 text-sm">
            <li className="flex items-center gap-2">
              <span className="inline-block size-3.5 rounded-[3px] bg-[#2A2C30]" />
              {t("legendBlocked")}
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block size-3.5 rounded-[3px] bg-[#d4d4d8]" />
              {t("legendSold")}
            </li>
          </ul>

          <form action={action} className="mt-4 space-y-3">
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="sessionId" value={sessionId} />
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t("note")}</span>
              <input
                name="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
                placeholder={t("notePlaceholder")}
                className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm outline-none focus:border-ring"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                name="block"
                value="1"
                disabled={pending || pickedFree.length === 0}
                onClick={(e) => {
                  e.currentTarget.form
                    ?.querySelector<HTMLInputElement>("input[name=keys]")
                    ?.setAttribute("value", JSON.stringify(pickedFree));
                }}
              >
                <Lock className="size-4" />
                {t("block", { count: pickedFree.length })}
              </Button>
              <Button
                type="submit"
                name="block"
                value="0"
                variant="outline"
                disabled={pending || pickedBlocked.length === 0}
                onClick={(e) => {
                  e.currentTarget.form
                    ?.querySelector<HTMLInputElement>("input[name=keys]")
                    ?.setAttribute("value", JSON.stringify(pickedBlocked));
                }}
              >
                <LockOpen className="size-4" />
                {t("unblock", { count: pickedBlocked.length })}
              </Button>
            </div>
            <input type="hidden" name="keys" defaultValue="[]" />
            {state?.ok ? (
              <p className="text-sm text-emerald-700">
                {t("done", { count: Number(state.id ?? 0) })}
              </p>
            ) : null}
            {state && !state.ok ? (
              <p role="alert" className="text-sm text-destructive">
                {t(`errors.${state.error}`)}
              </p>
            ) : null}
          </form>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">{t("blockedList", { count: blocked.length })}</h2>
          {blocked.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("noneBlocked")}</p>
          ) : (
            <ul className="mt-2 max-h-80 space-y-1 overflow-y-auto text-sm">
              {blocked.map((s) => (
                <li key={s.key} className="flex justify-between gap-3">
                  <span>{seatLabel(layout, s.key, locale)}</span>
                  <span className="truncate text-muted-foreground">{s.note ?? ""}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
