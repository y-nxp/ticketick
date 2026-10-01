"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { TicketCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Select, TextInput } from "@/components/admin/fields";
import { useRouter } from "@/i18n/navigation";
import { localeLabels, locales } from "@/i18n/routing";
import { reserveSeats } from "@/lib/admin/reservation-actions";
import type { FormState } from "@/lib/admin/types";

interface Row {
  id: string;
  name: string;
  price: string;
  available: number;
  zoneLabel: string | null;
}

export function ReservationForm({
  eventId,
  sessionId,
  locale,
  rows,
}: {
  eventId: string;
  sessionId: string;
  locale: string;
  rows: Row[];
}) {
  const t = useTranslations("admin.reservation");
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(
    reserveSeats,
    undefined,
  );

  React.useEffect(() => {
    if (state?.ok && state.id) router.push(`/admin/orders/${state.id}`);
  }, [state, router]);

  return (
    <form
      // Soumission manuelle : une action de formulaire viderait les quantités
      // saisies si la réservation est refusée.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        React.startTransition(() => action(data));
      }}
      className="space-y-5 rounded-2xl border border-border bg-card p-6"
    >
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="sessionId" value={sessionId} />

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[30rem] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-semibold">{t("tariff")}</th>
              <th className="px-4 py-2.5 text-right font-semibold">{t("price")}</th>
              <th className="px-4 py-2.5 text-right font-semibold">{t("available")}</th>
              <th className="w-32 px-4 py-2.5 text-right font-semibold">{t("quantity")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-2.5">
                  <span className="block font-medium">{row.name}</span>
                  {row.zoneLabel ? (
                    <span className="block text-xs text-muted-foreground">
                      {row.zoneLabel}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{row.price}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{row.available}</td>
                <td className="px-4 py-2">
                  <TextInput
                    name={`qty.${row.id}`}
                    type="number"
                    min="0"
                    max={String(row.available)}
                    placeholder="0"
                    ariaLabel={t("quantityFor", { name: row.name })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("ticketNote")} hint={t("ticketNoteHint")}>
          <TextInput
            name="ticketNote"
            maxLength={80}
            placeholder={t("ticketNotePlaceholder")}
          />
        </Field>
        <Field label={t("holderName")} hint={t("holderNameHint")}>
          <TextInput name="holderName" maxLength={120} />
        </Field>
        <Field label={t("ticketLocale")}>
          <Select
            name="locale"
            defaultValue={locales.includes(locale as never) ? locale : "fr"}
            options={locales.map((l) => ({ value: l, label: localeLabels[l] }))}
          />
        </Field>
      </div>

      {state && !state.ok ? (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
        >
          {t(`errors.${state.error}`)}
        </p>
      ) : null}

      <Button type="submit" disabled={pending || (state?.ok ?? false)}>
        <TicketCheck className="size-4" />
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
