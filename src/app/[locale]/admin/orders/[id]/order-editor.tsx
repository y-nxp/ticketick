"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Armchair, Mail, MinusCircle, PlusCircle, Save } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox, Field, Select, TextInput } from "@/components/admin/fields";
import { Link } from "@/i18n/navigation";
import { localeLabels, locales } from "@/i18n/routing";
import {
  addTicketsAction,
  chargeAction,
  removeTicketsAction,
  resendTicketsAction,
  updateOrderDetailsAction,
} from "@/lib/admin/order-edit-actions";
import type { FormState } from "@/lib/admin/types";
import { formatPrice } from "@/lib/utils";

export interface EditorTicket {
  id: string;
  code: string;
  label: string;
  status: "VALID" | "USED" | "CANCELLED" | "PENDING";
  priceCents: number;
  unpaid: boolean;
}

export interface EditorTariff {
  id: string;
  session: string;
  name: string;
  priceCents: number;
  available: number;
  invites: number | null;
}

export interface EditorCharge {
  id: string;
  number: string;
  kind: "PAYMENT" | "REFUND";
  method: "CASH" | "LINK" | "DOOR" | "TERMINAL" | "CREDIT_NOTE" | "PROVIDER";
  status: "OPEN" | "DONE" | "EXPIRED" | "CANCELLED" | "FAILED";
  amountCents: number;
  due: string | null;
  when: string;
}

export interface EditorProps {
  orderId: string;
  locale: string;
  editable: boolean;
  reseller: boolean;
  details: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    ticketNote: string;
    locale: string;
  };
  tickets: EditorTicket[];
  tariffs: EditorTariff[];
  charges: EditorCharge[];
  refundableCents: number;
  providerRefund: string | null;
  linkAvailable: boolean;
  seatedSessions: { id: string; label: string }[];
}

const PROVIDERS: Record<string, string> = {
  postfinance: "PostFinance",
  paypal: "PayPal",
  stripe: "Stripe",
  mock: "Simulation",
};

function Note({ state }: { state: FormState }) {
  const t = useTranslations("admin.orderEdit");
  if (!state) return null;
  if (state.ok) {
    return <p role="status" className="text-sm text-[var(--success)]">{t(`done.${state.id ?? "saved"}`)}</p>;
  }
  return (
    <p role="alert" className="text-sm text-destructive">
      {t(`errors.${state.error}`)}
    </p>
  );
}

export function OrderEditor(props: EditorProps) {
  const t = useTranslations("admin.orderEdit");
  const hasEmail = props.details.email.length > 0;
  return (
    <div className="mt-8 space-y-6">
      <h2 className="text-lg font-bold tracking-tight">{t("title")}</h2>
      {props.reseller ? (
        <p className="text-sm text-muted-foreground">{t("resellerHint")}</p>
      ) : null}
      <DetailsForm {...props} />
      {props.editable && !props.reseller ? (
        <>
          <RemovePanel {...props} />
          <AddPanel {...props} hasEmail={hasEmail} />
        </>
      ) : null}
      {props.charges.length > 0 ? <ChargesPanel {...props} /> : null}
      {props.editable ? <Toolbar {...props} hasEmail={hasEmail} /> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-card p-5">
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function DetailsForm({ orderId, details }: EditorProps) {
  const t = useTranslations("admin.orderEdit");
  const [state, action, pending] = useActionState<FormState, FormData>(
    updateOrderDetailsAction,
    undefined,
  );
  return (
    <Section title={t("details")}>
      <form action={action} className="space-y-4">
        <input type="hidden" name="orderId" value={orderId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("firstName")}>
            <TextInput name="firstName" defaultValue={details.firstName} maxLength={80} />
          </Field>
          <Field label={t("lastName")}>
            <TextInput name="lastName" defaultValue={details.lastName} maxLength={120} />
          </Field>
          <Field label={t("email")} hint={t("emailHint")}>
            <TextInput name="email" type="email" defaultValue={details.email} maxLength={200} />
          </Field>
          <Field label={t("phone")}>
            <TextInput name="phone" type="tel" defaultValue={details.phone} maxLength={40} />
          </Field>
          <Field label={t("ticketNote")} hint={t("ticketNoteHint")}>
            <TextInput name="ticketNote" defaultValue={details.ticketNote} maxLength={80} />
          </Field>
          <Field label={t("locale")}>
            <Select
              name="locale"
              defaultValue={details.locale}
              options={locales.map((l) => ({ value: l, label: localeLabels[l] }))}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="outline" disabled={pending}>
            <Save className="size-4" />
            {pending ? t("saving") : t("save")}
          </Button>
          <Note state={state} />
        </div>
      </form>
    </Section>
  );
}

function RemovePanel({
  orderId,
  locale,
  tickets,
  refundableCents,
  providerRefund,
  details,
}: EditorProps) {
  const t = useTranslations("admin.orderEdit");
  const ts = useTranslations("admin.ticketStatus");
  const [picked, setPicked] = React.useState<string[]>([]);
  const [refund, setRefund] = React.useState("NONE");
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const result = await removeTicketsAction(prev, formData);
      if (result?.ok) setPicked([]);
      return result;
    },
    undefined,
  );
  const fmt = locale;
  const removable = tickets.filter((x) => x.status === "VALID" || x.status === "PENDING");
  const dueCents = Math.min(
    refundableCents,
    tickets
      .filter((x) => picked.includes(x.id) && !x.unpaid)
      .reduce((sum, x) => sum + x.priceCents, 0),
  );

  return (
    <Section title={t("tickets")}>
      <form
        action={action}
        onSubmit={(e) => {
          if (!window.confirm(t("removeConfirm", { count: picked.length }))) e.preventDefault();
        }}
        className="space-y-4"
      >
        <input type="hidden" name="orderId" value={orderId} />
        <p className="text-sm text-muted-foreground">{t("removeHint")}</p>
        <ul className="divide-y divide-border rounded-control border border-border">
          {tickets.map((ticket) => {
            const active = removable.includes(ticket);
            return (
              <li key={ticket.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  name="ticket"
                  value={ticket.id}
                  disabled={!active}
                  checked={picked.includes(ticket.id)}
                  onChange={(e) =>
                    setPicked((prev) =>
                      e.target.checked
                        ? [...prev, ticket.id]
                        : prev.filter((id) => id !== ticket.id),
                    )
                  }
                  aria-label={ticket.code}
                  className="size-4 accent-[var(--primary)]"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs tracking-wider">{ticket.code}</p>
                  <p className="truncate text-xs text-muted-foreground">{ticket.label}</p>
                </div>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatPrice(ticket.priceCents, fmt)}
                </span>
                {ticket.unpaid ? (
                  <Badge variant="outline">{t("unpaid")}</Badge>
                ) : (
                  <Badge variant={ticket.status === "VALID" ? "default" : "secondary"}>
                    {ts(ticket.status)}
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>

        {picked.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("refund")}>
              <select
                name="refund"
                value={refund}
                onChange={(e) => setRefund(e.target.value)}
                className="h-11 w-full rounded-control border border-border bg-background px-3 text-sm"
              >
                <option value="NONE">{t("refundNone")}</option>
                <option value="CASH">{t("refundCash")}</option>
                <option value="CREDIT_NOTE" disabled={!details.email}>
                  {t("refundCredit")}
                </option>
                {providerRefund ? (
                  <option value="PROVIDER">
                    {t("refundProvider", { provider: PROVIDERS[providerRefund] ?? providerRefund })}
                  </option>
                ) : null}
              </select>
            </Field>
            {refund !== "NONE" ? (
              <Field
                label={t("refundAmount")}
                hint={t("refundHint", {
                  amount: formatPrice(dueCents, fmt),
                  paid: formatPrice(refundableCents, fmt),
                })}
              >
                <input
                  key={dueCents}
                  name="refundAmount"
                  inputMode="decimal"
                  defaultValue={(dueCents / 100).toFixed(2)}
                  className="h-11 w-full rounded-control border border-border bg-background px-3 text-sm"
                />
              </Field>
            ) : null}
            <div className="sm:col-span-2">
              <Checkbox name="toInvites" label={t("toInvites")} />
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="outline" disabled={pending || picked.length === 0}>
            <MinusCircle className="size-4" />
            {pending ? t("removing") : t("remove", { count: picked.length })}
          </Button>
          <Note state={state} />
        </div>
      </form>
    </Section>
  );
}

function AddPanel({
  orderId,
  locale,
  tariffs,
  linkAvailable,
  hasEmail,
}: EditorProps & { hasEmail: boolean }) {
  const t = useTranslations("admin.orderEdit");
  const [qty, setQty] = React.useState<Record<string, number>>({});
  const [settle, setSettle] = React.useState("CASH");
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const result = await addTicketsAction(prev, formData);
      if (result?.ok) setQty({});
      return result;
    },
    undefined,
  );
  const fmt = locale;
  const total = tariffs.reduce((sum, tt) => sum + tt.priceCents * (qty[tt.id] ?? 0), 0);
  const count = Object.values(qty).reduce((a, b) => a + b, 0);
  const linkOk = linkAvailable && hasEmail;

  if (tariffs.length === 0) return null;
  return (
    <Section title={t("add")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          React.startTransition(() => action(data));
        }}
        className="space-y-4"
      >
        <input type="hidden" name="orderId" value={orderId} />
        <div className="overflow-x-auto rounded-control border border-border">
          <table className="w-full min-w-[30rem] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">{t("tariff")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("price")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("available")}</th>
                <th className="w-28 px-3 py-2 text-right font-semibold">{t("quantity")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tariffs.map((tt) => (
                <tr key={tt.id}>
                  <td className="px-3 py-2">
                    <span className="block font-medium">{tt.name}</span>
                    <span className="block text-xs text-muted-foreground">{tt.session}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatPrice(tt.priceCents, fmt)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {tt.available}
                    {tt.invites ? (
                      <span className="block text-xs text-muted-foreground">
                        {t("invitesLeft", { count: tt.invites })}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      name={`qty.${tt.id}`}
                      type="number"
                      min="0"
                      max="500"
                      placeholder="0"
                      value={qty[tt.id] ?? ""}
                      onChange={(e) =>
                        setQty((prev) => ({
                          ...prev,
                          [tt.id]: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                        }))
                      }
                      aria-label={t("quantityFor", { name: tt.name })}
                      className="h-10 w-full rounded-control border border-border bg-background px-3 text-right text-sm"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Checkbox name="fromInvites" label={t("fromInvites")} />

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("settle")}>
            <select
              name="settle"
              value={settle}
              onChange={(e) => setSettle(e.target.value)}
              className="h-11 w-full rounded-control border border-border bg-background px-3 text-sm"
            >
              <option value="CASH">{t("settleCash")}</option>
              <option value="LINK" disabled={!linkOk}>
                {t("settleLink")}
              </option>
              <option value="DOOR">{t("settleDoor")}</option>
              <option value="FREE">{t("settleFree")}</option>
            </select>
          </Field>
          {settle !== "FREE" ? (
            <Field label={t("amount")} hint={t("amountHint", { amount: formatPrice(total, fmt) })}>
              <input
                name="amount"
                inputMode="decimal"
                placeholder={(total / 100).toFixed(2)}
                className="h-11 w-full rounded-control border border-border bg-background px-3 text-sm"
              />
            </Field>
          ) : null}
          {settle === "LINK" ? (
            <Field label={t("dueDays")} hint={t("dueHint")}>
              <TextInput name="dueDays" type="number" min="1" max="60" defaultValue="7" />
            </Field>
          ) : null}
        </div>
        {!linkOk ? (
          <p className="text-xs text-muted-foreground">
            {hasEmail ? t("linkNeedsCard") : t("linkNeedsEmail")}
          </p>
        ) : null}
        {settle === "DOOR" ? (
          <p className="text-xs text-muted-foreground">{t("doorHint")}</p>
        ) : null}
        {(settle === "CASH" || settle === "FREE") && hasEmail ? (
          <Checkbox name="sendTickets" label={t("sendTickets")} defaultChecked />
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending || count === 0}>
            <PlusCircle className="size-4" />
            {pending ? t("adding") : t("submitAdd", { count })}
          </Button>
          <Note state={state} />
        </div>
      </form>
    </Section>
  );
}

function ChargesPanel({ orderId, locale, charges }: EditorProps) {
  const t = useTranslations("admin.orderEdit");
  const [state, action, pending] = useActionState<FormState, FormData>(
    chargeAction,
    undefined,
  );
  const fmt = locale;

  function op(charge: EditorCharge, name: string, label: string, confirm?: string) {
    return (
      <form
        action={action}
        onSubmit={(e) => {
          if (confirm && !window.confirm(confirm)) e.preventDefault();
        }}
      >
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="chargeId" value={charge.id} />
        <input type="hidden" name="op" value={name} />
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {label}
        </Button>
      </form>
    );
  }

  return (
    <Section title={t("charges")}>
      <ul className="divide-y divide-border rounded-control border border-border">
        {charges.map((charge) => {
          const open = charge.status === "OPEN";
          const failed = charge.status === "FAILED";
          return (
            <li key={charge.id} className="space-y-2 px-3 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-xs">{charge.number}</span>
                <span className="font-medium">
                  {t(`kind.${charge.kind}`)} · {t(`method.${charge.method}`)}
                </span>
                <span className="tabular-nums">
                  {charge.kind === "REFUND" ? "−" : ""}
                  {formatPrice(charge.amountCents, fmt)}
                </span>
                <Badge variant={charge.status === "DONE" ? "success" : open ? "outline" : "secondary"}>
                  {t(`status.${charge.status}`)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {charge.when}
                  {charge.due && open ? ` · ${t("dueOn", { date: charge.due })}` : ""}
                </span>
              </div>
              {open || failed ? (
                <div className="flex flex-wrap gap-2">
                  {charge.kind === "PAYMENT" && open ? (
                    <>
                      {op(charge, "settle", t("markPaid"))}
                      {charge.method === "LINK" ? op(charge, "resend", t("resendLink")) : null}
                      {op(charge, "cancel", t("cancelCharge"), t("cancelChargeConfirm"))}
                    </>
                  ) : null}
                  {charge.kind === "REFUND" ? (
                    <>
                      {charge.method === "PROVIDER" ? op(charge, "retry", t("retryRefund")) : null}
                      {op(charge, "settle", t("markRefunded"), t("markRefundedConfirm"))}
                    </>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="mt-3"><Note state={state} /></div>
    </Section>
  );
}

function Toolbar({
  orderId,
  seatedSessions,
  hasEmail,
}: EditorProps & { hasEmail: boolean }) {
  const t = useTranslations("admin.orderEdit");
  const [state, action, pending] = useActionState<FormState, FormData>(
    resendTicketsAction,
    undefined,
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {seatedSessions.map((s) => (
        <Link
          key={s.id}
          href={`/admin/orders/${orderId}/seats?session=${s.id}`}
          className={buttonVariants({ variant: "outline" })}
        >
          <Armchair className="size-4" />
          {seatedSessions.length > 1 ? t("moveSeatsFor", { session: s.label }) : t("moveSeats")}
        </Link>
      ))}
      {hasEmail ? (
        <form action={action}>
          <input type="hidden" name="orderId" value={orderId} />
          <Button type="submit" variant="outline" disabled={pending}>
            <Mail className="size-4" />
            {pending ? t("sending") : t("resendTickets")}
          </Button>
        </form>
      ) : null}
      <Note state={state} />
    </div>
  );
}
