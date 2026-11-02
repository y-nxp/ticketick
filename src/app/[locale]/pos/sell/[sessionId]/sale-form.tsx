"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Download, Plus, QrCode, TicketCheck, X } from "lucide-react";
import { Field, TextInput } from "@/components/admin/fields";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import type { DiscountPreview } from "@/lib/orders/discounts";
import { previewPosDiscounts, sellAtPosAction } from "@/lib/resellers/actions";
import type { PosSaleState } from "@/lib/resellers/types";
import { formatPrice } from "@/lib/utils";
import { partCount, partTotal, usePosCart, type CartPart } from "../pos-cart";
import { PosSeatPicker, type SeatPick } from "./seat-picker";

interface Row {
  id: string;
  name: string;
  price: string;
  priceCents: number;
  available: number;
  companion: boolean;
  requiresAttendee: boolean;
  maxAgeYears: number | null;
  zones: string[];
}

type Method = "CASH" | "TERMINAL" | "ONLINE";
type SeatMode = "plan" | "auto";

const inputClass =
  "h-11 w-full rounded-control border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-ring";

interface SaleProps {
  agentId: string;
  sessionId: string;
  /** Titre et date du concert, repris dans la vente en cours. */
  title: string;
  when: string;
  locale: string;
  methods: Method[];
  seated: boolean;
  rows: Row[];
}

const noSubscribe = () => () => {};

export function PosSaleForm(props: SaleProps) {
  // Nouvelle vente : le formulaire repart de zéro, résultat compris.
  const [round, setRound] = React.useState(0);
  // La vente en cours est lue dans ce navigateur : rien à montrer avant.
  const mounted = React.useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const cart = usePosCart(props.agentId);
  if (!mounted) return null;
  return (
    <SaleRound
      key={round}
      {...props}
      initial={cart.parts.find((p) => p.sessionId === props.sessionId)}
      onNext={() => setRound((n) => n + 1)}
    />
  );
}

function SaleRound({
  agentId,
  sessionId,
  title,
  when,
  locale,
  methods,
  seated,
  rows,
  initial,
  onNext,
}: SaleProps & {
  /** Ce concert est déjà dans la vente en cours : sa sélection est reprise. */
  initial?: CartPart;
  onNext: () => void;
}) {
  const t = useTranslations("pos.sell");
  const router = useRouter();
  const cart = usePosCart(agentId);
  const formRef = React.useRef<HTMLFormElement>(null);
  const [typed, setQty] = React.useState<Record<string, number>>(() =>
    initial?.seatMode === "auto"
      ? Object.fromEntries(initial.lines.map((l) => [l.ticketTypeId, l.quantity]))
      : {},
  );
  const [mode, setMode] = React.useState<SeatMode>(
    seated ? (initial?.seatMode ?? "plan") : "auto",
  );
  const [picks, setPicks] = React.useState<SeatPick[]>(() =>
    initial?.seatMode === "plan"
      ? initial.lines.flatMap((l) =>
          (l.seatKeys ?? []).map((key) => ({ key, ticketTypeId: l.ticketTypeId })),
        )
      : [],
  );
  const [method, setMethod] = React.useState<Method>(methods[0]!);
  const [state, action, pending] = useActionState<PosSaleState, FormData>(
    sellAtPosAction,
    undefined,
  );
  const others = cart.parts.filter((p) => p.sessionId !== sessionId);
  const onPlan = seated && mode === "plan";
  const qty: Record<string, number> = onPlan
    ? picks.reduce<Record<string, number>>(
        (acc, p) => ({ ...acc, [p.ticketTypeId]: (acc[p.ticketTypeId] ?? 0) + 1 }),
        {},
      )
    : typed;
  const own = rows.reduce((sum, r) => sum + r.priceCents * (qty[r.id] ?? 0), 0);
  const ownCount = rows.reduce((sum, r) => sum + (qty[r.id] ?? 0), 0);
  const total = own + others.reduce((sum, p) => sum + partTotal(p), 0);
  const count = ownCount + others.reduce((sum, p) => sum + partCount(p), 0);
  const nominative = rows.filter((r) => r.requiresAttendee && (qty[r.id] ?? 0) > 0);
  const seatsOf = (id: string) =>
    onPlan ? picks.filter((p) => p.ticketTypeId === id).map((p) => p.key) : undefined;

  // Rabais automatiques de toute la vente, recalculés par le serveur.
  const previewKey = JSON.stringify([
    ...others.flatMap((p) =>
      p.lines.map((l) => ({ ticketTypeId: l.ticketTypeId, quantity: l.quantity, seats: l.seatKeys })),
    ),
    ...rows
      .filter((r) => (qty[r.id] ?? 0) > 0)
      .map((r) => ({ ticketTypeId: r.id, quantity: qty[r.id]!, seats: seatsOf(r.id) })),
  ]);
  const [preview, setPreview] = React.useState<{ key: string; value: DiscountPreview } | null>(null);
  React.useEffect(() => {
    if (previewKey === "[]") return;
    let ignore = false;
    const timer = setTimeout(() => {
      previewPosDiscounts(JSON.parse(previewKey), locale)
        .then((value) => {
          if (!ignore) setPreview({ key: previewKey, value });
        })
        .catch(() => {});
    }, 300);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [previewKey, locale]);
  const discount = preview?.key === previewKey ? preview.value : null;
  const due = Math.max(0, total - (discount?.amountCents ?? 0));
  const money = (cents: number) => formatPrice(cents, `${locale}-CH`);

  // Le concert affiché rejoint la vente en cours ; le vendeur en choisit un autre.
  function addAndContinue() {
    const form = formRef.current;
    if (!form || ownCount === 0 || !form.reportValidity()) return;
    const data = new FormData(form);
    cart.put({
      sessionId,
      title,
      when,
      seatMode: onPlan ? "plan" : "auto",
      lines: rows
        .filter((r) => (qty[r.id] ?? 0) > 0)
        .map((r) => ({
          ticketTypeId: r.id,
          name: r.name,
          quantity: qty[r.id]!,
          priceCents: r.priceCents,
          seatKeys: seatsOf(r.id),
        })),
      attendees: nominative.flatMap((r) =>
        Array.from({ length: Math.min(qty[r.id] ?? 0, 100) }, (_, i) => ({
          ticketTypeId: r.id,
          name: String(data.get(`attendee.${r.id}.${i}.name`) ?? ""),
          birthDate: String(data.get(`attendee.${r.id}.${i}.birthDate`) ?? ""),
        })),
      ),
    });
    router.push("/pos/sell");
  }

  // Vente faite : la vente en cours est terminée.
  const done = state?.ok === true;
  React.useEffect(() => {
    if (done) cart.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une fois, à la vente
  }, [done]);

  const initialAttendee = (id: string, i: number) =>
    initial?.attendees.filter((a) => a.ticketTypeId === id)[i];

  const failedPart =
    state && !state.ok && state.ticketTypeId
      ? others.find((p) => p.lines.some((l) => l.ticketTypeId === state.ticketTypeId))
      : undefined;

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
      ref={formRef}
      className="space-y-5 rounded-card border border-border bg-card p-6"
    >
      <input type="hidden" name="locale" value={locale} />

      {others.length > 0 ? (
        <section className="rounded-control border border-border bg-muted/40 p-4">
          <h2 className="text-sm font-medium">{t("cart.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("cart.hint")}</p>
          <ul className="mt-3 divide-y divide-border text-sm">
            {others.map((part) => (
              <li key={part.sessionId} className="flex items-start gap-3 py-2">
                <Link href={`/pos/sell/${part.sessionId}`} className="min-w-0 flex-1 hover:text-primary">
                  <span className="block font-medium">{part.title}</span>
                  <span className="block text-xs text-muted-foreground">{part.when}</span>
                  <span className="block text-xs text-muted-foreground">
                    {part.lines.map((l) => `${l.quantity} × ${l.name}`).join(" · ")}
                  </span>
                </Link>
                <span className="shrink-0 tabular-nums">{money(partTotal(part))}</span>
                <button
                  type="button"
                  onClick={() => cart.remove(part.sessionId)}
                  aria-label={t("cart.remove", { title: part.title })}
                  className="shrink-0 rounded-control p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                >
                  <X className="size-4" aria-hidden />
                </button>
                {part.lines.map((l) => (
                  <React.Fragment key={l.ticketTypeId}>
                    <input type="hidden" name={`qty.${l.ticketTypeId}`} value={l.quantity} />
                    {l.seatKeys?.length ? (
                      <input type="hidden" name={`seats.${l.ticketTypeId}`} value={l.seatKeys.join(",")} />
                    ) : null}
                  </React.Fragment>
                ))}
                {part.attendees.map((a, i) => {
                  const index = part.attendees.slice(0, i).filter((b) => b.ticketTypeId === a.ticketTypeId).length;
                  return (
                    <React.Fragment key={`${a.ticketTypeId}.${index}`}>
                      <input type="hidden" name={`attendee.${a.ticketTypeId}.${index}.name`} value={a.name} />
                      <input type="hidden" name={`attendee.${a.ticketTypeId}.${index}.birthDate`} value={a.birthDate} />
                    </React.Fragment>
                  );
                })}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {seated ? (
        <fieldset>
          <legend className="text-sm font-medium">{t("seatMode.title")}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(["plan", "auto"] as const).map((m) => (
              <label
                key={m}
                className={`flex cursor-pointer items-start gap-2.5 rounded-control border p-3 text-sm transition-colors ${
                  mode === m ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                }`}
              >
                <input
                  type="radio"
                  name="seatMode"
                  value={m}
                  checked={mode === m}
                  onChange={() => setMode(m)}
                  className="mt-0.5 accent-[var(--primary)]"
                />
                <span>
                  <span className="block font-medium">{t(`seatMode.${m}`)}</span>
                  <span className="block text-xs text-muted-foreground">{t(`seatMode.${m}Hint`)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {onPlan ? (
        <>
          <PosSeatPicker
            sessionId={sessionId}
            locale={locale}
            rows={rows}
            picks={picks}
            onChange={setPicks}
            refreshKey={state}
          />
          {rows.map((row) =>
            qty[row.id] ? (
              <React.Fragment key={row.id}>
                <input type="hidden" name={`qty.${row.id}`} value={qty[row.id]} />
                <input
                  type="hidden"
                  name={`seats.${row.id}`}
                  value={picks.filter((p) => p.ticketTypeId === row.id).map((p) => p.key).join(",")}
                />
              </React.Fragment>
            ) : null,
          )}
        </>
      ) : (
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
      )}

      {nominative.length > 0 ? (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">{t("attendeesTitle")}</legend>
          {nominative.flatMap((row) =>
            Array.from({ length: Math.min(qty[row.id] ?? 0, 100) }, (_, i) => (
              <div key={`${row.id}.${i}`} className="grid gap-3 sm:grid-cols-[1fr_12rem]">
                <Field label={`${row.name} ${i + 1} · ${t("attendeeName")}`}>
                  <TextInput
                    name={`attendee.${row.id}.${i}.name`}
                    maxLength={120}
                    required
                    defaultValue={initialAttendee(row.id, i)?.name}
                  />
                </Field>
                <Field label={t("attendeeBirthDate")}>
                  <TextInput
                    name={`attendee.${row.id}.${i}.birthDate`}
                    type="date"
                    required
                    defaultValue={initialAttendee(row.id, i)?.birthDate}
                  />
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
          {failedPart ? ` (${failedPart.title}, ${failedPart.when})` : null}
        </p>
      ) : null}

      <div className="space-y-4 border-t border-border pt-4">
        <div className="text-sm">
          {discount?.items.length ? (
            <>
              <p className="flex justify-between gap-4 text-muted-foreground">
                <span>{t("subtotal")}</span>
                <span className="tabular-nums">{money(total)}</span>
              </p>
              {discount.items.map((d) => (
                <p key={d.label} className="flex justify-between gap-4 text-[var(--success)]">
                  <span>{d.label}</span>
                  <span className="tabular-nums">−{money(d.amountCents)}</span>
                </p>
              ))}
            </>
          ) : null}
          <p className="flex justify-between gap-4">
            <span>
              {others.length > 0
                ? t("summaryConcerts", { count, concerts: others.length + (ownCount > 0 ? 1 : 0) })
                : t("summary", { count })}
            </span>
            <span className="font-semibold tabular-nums">{money(due)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={pending || ownCount === 0}
            onClick={addAndContinue}
          >
            <Plus className="size-4" />
            {t("cart.add")}
          </Button>
          <Button type="submit" size="lg" disabled={pending || count === 0}>
            <TicketCheck className="size-4" />
            {pending
              ? t("submitting")
              : total > 0
                ? t(`submit.${method}`, { amount: money(due) })
                : t("submitFree")}
          </Button>
        </div>
      </div>
    </form>
  );
}
