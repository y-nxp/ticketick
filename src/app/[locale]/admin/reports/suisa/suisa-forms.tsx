"use client";

import { useActionState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Check, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveDoorSales, saveSuisaMusic } from "@/lib/admin/suisa-actions";
import type { FormState } from "@/lib/admin/types";

const control =
  "h-9 rounded-control border border-border bg-background px-2 text-sm outline-none transition-colors focus:border-ring disabled:opacity-60";

/** Musique du spectacle, enregistrée dès qu'on change de choix. */
export function MusicSelect({ eventId, value }: { eventId: string; value: string | null }) {
  const t = useTranslations("admin.suisa");
  const [state, save, saving] = useActionState<FormState, FormData>(saveSuisaMusic, undefined);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={save} className="flex items-center gap-1.5 print:hidden">
      <input type="hidden" name="eventId" value={eventId} />
      <select
        name="music"
        aria-label={t("music")}
        defaultValue={value ?? ""}
        disabled={saving}
        onChange={() => form.current?.requestSubmit()}
        className={`${control} max-w-44 ${value ? "" : "border-amber-500"}`}
      >
        <option value="">{t("musicValues.unset")}</option>
        <option value="PROTECTED">{t("musicValues.PROTECTED")}</option>
        <option value="PUBLIC_DOMAIN">{t("musicValues.PUBLIC_DOMAIN")}</option>
        <option value="NONE">{t("musicValues.NONE")}</option>
      </select>
      {state && !state.ok ? (
        <span role="alert" className="text-xs text-destructive">
          {t(`errors.${state.error}`)}
        </span>
      ) : null}
    </form>
  );
}

/** Caisse du soir tenue hors ticketick : billets payants et montant TTC. */
export function DoorSalesForm({
  sessionId,
  tickets,
  amount,
}: {
  sessionId: string;
  tickets: number | null;
  amount: string;
}) {
  const t = useTranslations("admin.suisa");
  const [state, save, saving] = useActionState<FormState, FormData>(saveDoorSales, undefined);
  return (
    <form action={save} className="flex flex-wrap items-center justify-end gap-1.5 print:hidden">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input
        name="doorTickets"
        inputMode="numeric"
        defaultValue={tickets ?? ""}
        placeholder="0"
        aria-label={t("doorTickets")}
        title={t("doorTickets")}
        className={`${control} w-16 text-right tabular-nums`}
      />
      <input
        name="doorAmount"
        inputMode="decimal"
        defaultValue={amount}
        placeholder="0.00"
        aria-label={t("doorAmount")}
        title={t("doorAmount")}
        className={`${control} w-24 text-right tabular-nums`}
      />
      <Button type="submit" size="sm" variant="ghost" disabled={saving} aria-label={t("save")} title={t("save")}>
        <Check className="size-4" />
      </Button>
      {state && !state.ok ? (
        <span role="alert" className="w-full text-right text-xs text-destructive">
          {t(`errors.${state.error}`)}
        </span>
      ) : null}
    </form>
  );
}

export function PrintButton() {
  const t = useTranslations("admin.suisa");
  return (
    <Button type="button" variant="outline" onClick={() => window.print()} className="print:hidden">
      <Printer className="size-4" />
      {t("print")}
    </Button>
  );
}
