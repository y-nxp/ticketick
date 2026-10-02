"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { TicketCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select, TextInput } from "@/components/admin/fields";
import { useRouter } from "@/i18n/navigation";
import { localeLabels, locales } from "@/i18n/routing";
import { reserveSeats } from "@/lib/admin/reservation-actions";
import type { FormState } from "@/lib/admin/types";
import { formatPrice } from "@/lib/utils";

interface Row {
  id: string;
  name: string;
  price: string;
  priceCents: number;
  available: number;
  invites: number | null;
  zoneLabel: string | null;
}

export function ReservationForm({
  eventId,
  sessionId,
  locale,
  rows,
  seated,
  linkAvailable,
}: {
  eventId: string;
  sessionId: string;
  locale: string;
  rows: Row[];
  seated: boolean;
  linkAvailable: boolean;
}) {
  const t = useTranslations("admin.reservation");
  const te = useTranslations("admin.orderEdit");
  const [qty, setQty] = React.useState<Record<string, number>>({});
  const [settle, setSettle] = React.useState("FREE");
  const [email, setEmail] = React.useState("");
  const total = rows.reduce((sum, r) => sum + r.priceCents * (qty[r.id] ?? 0), 0);
  const hasEmail = email.includes("@");
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
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {row.available}
                  {row.invites ? (
                    <span className="block text-xs text-muted-foreground">
                      {te("invitesLeft", { count: row.invites })}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2">
                  <input
                    name={`qty.${row.id}`}
                    type="number"
                    min="0"
                    max="1000"
                    placeholder="0"
                    value={qty[row.id] ?? ""}
                    onChange={(e) =>
                      setQty((prev) => ({
                        ...prev,
                        [row.id]: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                      }))
                    }
                    aria-label={t("quantityFor", { name: row.name })}
                    className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("email")} hint={t("emailHint")}>
          <input
            name="email"
            type="email"
            maxLength={200}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
          />
        </Field>
        <Field label={t("phone")}>
          <TextInput name="phone" type="tel" maxLength={40} />
        </Field>
      </div>

      {seated ? <Checkbox name="fromInvites" label={te("fromInvites")} /> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={te("settle")}>
          <select
            name="settle"
            value={settle}
            onChange={(e) => setSettle(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
          >
            <option value="FREE">{t("settleFree")}</option>
            <option value="CASH">{te("settleCash")}</option>
            <option value="LINK" disabled={!linkAvailable || !hasEmail}>
              {te("settleLink")}
            </option>
            <option value="DOOR">{te("settleDoor")}</option>
          </select>
        </Field>
        {settle !== "FREE" ? (
          <Field
            label={te("amount")}
            hint={te("amountHint", { amount: formatPrice(total, `${locale}-CH`) })}
          >
            <input
              name="amount"
              inputMode="decimal"
              placeholder={(total / 100).toFixed(2)}
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
            />
          </Field>
        ) : null}
        {settle === "LINK" ? (
          <Field label={te("dueDays")} hint={te("dueHint")}>
            <TextInput name="dueDays" type="number" min="1" max="60" defaultValue="7" />
          </Field>
        ) : null}
      </div>
      {!linkAvailable || !hasEmail ? (
        <p className="text-xs text-muted-foreground">
          {linkAvailable ? te("linkNeedsEmail") : te("linkNeedsCard")}
        </p>
      ) : null}
      {settle === "DOOR" ? (
        <p className="text-xs text-muted-foreground">{te("doorHint")}</p>
      ) : null}
      {settle !== "LINK" && hasEmail ? (
        <Checkbox name="sendTickets" label={te("sendTickets")} />
      ) : null}

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
