"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Download, QrCode, TicketCheck } from "lucide-react";
import { Field, TextInput } from "@/components/admin/fields";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { sellAtPosAction } from "@/lib/resellers/actions";
import type { PosSaleState } from "@/lib/resellers/types";
import { formatPrice } from "@/lib/utils";

interface Row {
  id: string;
  name: string;
  price: string;
  priceCents: number;
  available: number;
  companion: boolean;
  requiresAttendee: boolean;
  maxAgeYears: number | null;
}

type Method = "CASH" | "TERMINAL" | "ONLINE";

const inputClass =
  "h-11 w-full rounded-control border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-ring";

export function PosSaleForm(props: {
  sessionId: string;
  locale: string;
  methods: Method[];
  seated: boolean;
  rows: Row[];
}) {
  // Nouvelle vente : le formulaire repart de zéro, résultat compris.
  const [round, setRound] = React.useState(0);
  return <SaleRound key={round} {...props} onNext={() => setRound((n) => n + 1)} />;
}

function SaleRound({
  sessionId,
  locale,
  methods,
  seated,
  rows,
  onNext,
}: {
  sessionId: string;
  locale: string;
  methods: Method[];
  seated: boolean;
  rows: Row[];
  onNext: () => void;
}) {
  const t = useTranslations("pos.sell");
  const [qty, setQty] = React.useState<Record<string, number>>({});
  const [method, setMethod] = React.useState<Method>(methods[0]!);
  const [state, action, pending] = useActionState<PosSaleState, FormData>(
    sellAtPosAction,
    undefined,
  );
  const total = rows.reduce((sum, r) => sum + r.priceCents * (qty[r.id] ?? 0), 0);
  const count = rows.reduce((sum, r) => sum + (qty[r.id] ?? 0), 0);
  const nominative = rows.filter((r) => r.requiresAttendee && (qty[r.id] ?? 0) > 0);

  if (state?.ok) {
    return (
      <section className="space-y-4 rounded-card border border-border bg-card p-6">
        {state.payUrl && state.payQr ? (
          <>
            <div className="flex items-center gap-2 text-primary">
              <QrCode className="size-5" />
              <h2 className="text-lg">{t("payTitle")}</h2>
            </div>
            <p className="text-sm text-muted-foreground">{t("payHint")}</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- QR en data URL */}
            <img
              src={state.payQr}
              alt={t("payQrAlt")}
              width={260}
              height={260}
              className="rounded-control border border-border bg-white p-2"
            />
            <p className="break-all text-xs text-muted-foreground">
              <a href={state.payUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                {state.payUrl}
              </a>
            </p>
            {state.emailed ? <p className="text-sm">{t("payEmailed")}</p> : null}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-[var(--success)]">
              <CheckCircle2 className="size-5" />
              <h2 className="text-lg text-foreground">{t("doneTitle", { reference: state.reference })}</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              {state.emailed ? t("doneEmailed") : t("donePrint")}
            </p>
            {state.pdfUrl ? (
              <a href={state.pdfUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}>
                <Download className="size-4" />
                {t("download")}
              </a>
            ) : null}
          </>
        )}
        <div className="flex flex-wrap gap-3 pt-2">
          <Button type="button" onClick={onNext}>
            <TicketCheck className="size-4" />
            {t("next")}
          </Button>
          <Link href={`/pos/sales/${state.orderId}`} className={buttonVariants({ variant: "outline" })}>
            {t("viewSale")}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <form
      // Soumission manuelle : une action de formulaire viderait les quantités
      // saisies si la vente est refusée.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        React.startTransition(() => action(data));
      }}
      className="space-y-5 rounded-card border border-border bg-card p-6"
    >
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="locale" value={locale} />

      <div className="overflow-x-auto rounded-control border border-border">
        <table className="w-full min-w-[28rem] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">{t("tariff")}</th>
              <th className="px-4 py-2.5 text-right font-medium">{t("price")}</th>
              <th className="px-4 py-2.5 text-right font-medium">{t("available")}</th>
              <th className="w-28 px-4 py-2.5 text-right font-medium">{t("quantity")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-2.5">
                  <span className="block font-medium">{row.name}</span>
                  {row.companion ? (
                    <span className="block text-xs text-muted-foreground">{t("companionHint")}</span>
                  ) : null}
                  {row.requiresAttendee ? (
                    <span className="block text-xs text-muted-foreground">
                      {row.maxAgeYears
                        ? t("attendeeAgeHint", { age: row.maxAgeYears })
                        : t("attendeeHint")}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{row.price}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{row.available}</td>
                <td className="px-4 py-2">
                  <input
                    name={`qty.${row.id}`}
                    type="number"
                    min="0"
                    max={Math.min(100, row.available)}
                    placeholder="0"
                    disabled={row.available === 0}
                    value={qty[row.id] ?? ""}
                    onChange={(e) =>
                      setQty((prev) => ({
                        ...prev,
                        [row.id]: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                      }))
                    }
                    aria-label={t("quantityFor", { name: row.name })}
                    className={`${inputClass} text-right disabled:opacity-50`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {seated ? <p className="text-xs text-muted-foreground">{t("seatedHint")}</p> : null}

      {nominative.length > 0 ? (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">{t("attendeesTitle")}</legend>
          {nominative.flatMap((row) =>
            Array.from({ length: Math.min(qty[row.id] ?? 0, 100) }, (_, i) => (
              <div key={`${row.id}.${i}`} className="grid gap-3 sm:grid-cols-[1fr_12rem]">
                <Field label={`${row.name} ${i + 1} · ${t("attendeeName")}`}>
                  <TextInput name={`attendee.${row.id}.${i}.name`} maxLength={120} required />
                </Field>
                <Field label={t("attendeeBirthDate")}>
                  <TextInput name={`attendee.${row.id}.${i}.birthDate`} type="date" required />
                </Field>
              </div>
            )),
          )}
        </fieldset>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("holderName")} hint={t("holderNameHint")}>
          <TextInput name="holderName" maxLength={120} />
        </Field>
        <Field label={t("email")} hint={t("emailHint")}>
          <TextInput name="email" type="email" maxLength={200} />
        </Field>
        <Field label={t("phone")}>
          <TextInput name="phone" type="tel" maxLength={40} />
        </Field>
      </div>

      {total > 0 ? (
        <fieldset>
          <legend className="text-sm font-medium">{t("method")}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {methods.map((m) => (
              <label
                key={m}
                className={`flex cursor-pointer items-start gap-2.5 rounded-control border p-3 text-sm transition-colors ${
                  method === m ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                }`}
              >
                <input
                  type="radio"
                  name="method"
                  value={m}
                  checked={method === m}
                  onChange={() => setMethod(m)}
                  className="mt-0.5 accent-[var(--primary)]"
                />
                <span>
                  <span className="block font-medium">{t(`methods.${m}`)}</span>
                  <span className="block text-xs text-muted-foreground">{t(`methodHints.${m}`)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <input type="hidden" name="method" value={methods[0]} />
      )}

      {state && !state.ok ? (
        <p role="alert" className="rounded-control bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
          {t(`errors.${state.error}`)}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
        <p className="text-sm">
          {t("summary", { count })} ·{" "}
          <span className="font-semibold tabular-nums">{formatPrice(total, `${locale}-CH`)}</span>
        </p>
        <Button type="submit" size="lg" disabled={pending || count === 0}>
          <TicketCheck className="size-4" />
          {pending
            ? t("submitting")
            : total > 0
              ? t(`submit.${method}`, { amount: formatPrice(total, `${locale}-CH`) })
              : t("submitFree")}
        </Button>
      </div>
    </form>
  );
}
