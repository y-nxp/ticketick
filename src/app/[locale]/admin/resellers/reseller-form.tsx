"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Checkbox, Field, Select, TextArea, TextInput } from "@/components/admin/fields";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { FormState } from "@/lib/admin/types";
import { saveReseller } from "@/lib/resellers/actions";

export interface ResellerFormValues {
  id?: string;
  name: string;
  type: string;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  locale: string;
  organizerId: string | null;
  commissionKind: string;
  commissionBps: number;
  commissionFixedCents: number;
  allowCashSales: boolean;
  allowTerminalSales: boolean;
  allowOnlineSales: boolean;
  notifyEmails: string[];
  reportFrequency: string;
  reportCopyOrganizer: boolean;
  active: boolean;
}

const EMPTY: ResellerFormValues = {
  name: "",
  type: "TOURISM_OFFICE",
  email: "",
  phone: null,
  address: null,
  city: null,
  locale: "fr",
  organizerId: null,
  commissionKind: "PERCENT",
  commissionBps: 0,
  commissionFixedCents: 0,
  allowCashSales: true,
  allowTerminalSales: true,
  allowOnlineSales: true,
  notifyEmails: [],
  reportFrequency: "WEEKLY",
  reportCopyOrganizer: true,
  active: true,
};

export function ResellerForm({
  values = EMPTY,
  organizers,
}: {
  values?: ResellerFormValues;
  /** Admin seulement : rattacher le point de vente à un organisateur. */
  organizers: { id: string; name: string }[] | null;
}) {
  const t = useTranslations("admin.resellers");
  const ta = useTranslations("admin");
  const router = useRouter();
  const [kind, setKind] = React.useState(values.commissionKind);
  const [state, action, pending] = useActionState<FormState, FormData>(saveReseller, undefined);
  const editing = Boolean(values.id);

  React.useEffect(() => {
    if (state?.ok && state.id && !editing) router.push(`/admin/resellers/${state.id}`);
  }, [state, editing, router]);

  return (
    <form
      // Soumission manuelle : une action de formulaire viderait la saisie si
      // l'enregistrement est refusé.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        React.startTransition(() => action(data));
      }}
      className="space-y-6 rounded-card border border-border bg-card p-6"
    >
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("fields.name")}>
          <TextInput name="name" defaultValue={values.name} required maxLength={120} />
        </Field>
        <Field label={t("fields.type")}>
          <Select
            name="type"
            defaultValue={values.type}
            options={(["TOURISM_OFFICE", "PARTNER_SHOP", "BOX_OFFICE"] as const).map((v) => ({
              value: v,
              label: ta(`resellerType.${v}`),
            }))}
          />
        </Field>
        <Field label={t("fields.email")} hint={t("fields.emailHint")}>
          <TextInput name="email" type="email" defaultValue={values.email} required maxLength={200} />
        </Field>
        <Field label={t("fields.phone")}>
          <TextInput name="phone" type="tel" defaultValue={values.phone} maxLength={40} />
        </Field>
        <Field label={t("fields.address")}>
          <TextInput name="address" defaultValue={values.address} maxLength={200} />
        </Field>
        <Field label={t("fields.city")}>
          <TextInput name="city" defaultValue={values.city} maxLength={100} />
        </Field>
        <Field label={t("fields.locale")} hint={t("fields.localeHint")}>
          <Select
            name="locale"
            defaultValue={values.locale}
            options={[
              { value: "fr", label: "Français" },
              { value: "en", label: "English" },
              { value: "de", label: "Deutsch" },
              { value: "it", label: "Italiano" },
            ]}
          />
        </Field>
        {organizers ? (
          <Field label={t("fields.organizer")} hint={t("fields.organizerHint")}>
            <Select
              name="organizerId"
              defaultValue={values.organizerId}
              emptyLabel={t("allOrganizers")}
              options={organizers.map((o) => ({ value: o.id, label: o.name }))}
            />
          </Field>
        ) : null}
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t("fields.commission")}</legend>
        <p className="text-xs text-muted-foreground">{t("fields.commissionHint")}</p>
        <CommissionInputs
          prefix="commission"
          kind={kind}
          onKind={setKind}
          bps={values.commissionBps}
          fixedCents={values.commissionFixedCents}
        />
      </fieldset>

      <fieldset className="space-y-2.5">
        <legend className="text-sm font-medium">{t("fields.methods")}</legend>
        <Checkbox name="allowCashSales" label={t("fields.cash")} defaultChecked={values.allowCashSales} />
        <Checkbox
          name="allowTerminalSales"
          label={t("fields.terminal")}
          defaultChecked={values.allowTerminalSales}
        />
        <Checkbox
          name="allowOnlineSales"
          label={t("fields.online")}
          defaultChecked={values.allowOnlineSales}
        />
        <p className="text-xs text-muted-foreground">{t("fields.methodsHint")}</p>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium">{t("fields.mails")}</legend>
        <Field label={t("fields.notifyEmails")} hint={t("fields.notifyEmailsHint")}>
          <TextArea name="notifyEmails" rows={3} defaultValue={values.notifyEmails.join("\n")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("fields.reportFrequency")} hint={t("fields.reportFrequencyHint")}>
            <Select
              name="reportFrequency"
              defaultValue={values.reportFrequency}
              options={(["NONE", "DAILY", "WEEKLY"] as const).map((v) => ({
                value: v,
                label: t(`frequency.${v}`),
              }))}
            />
          </Field>
        </div>
        <Checkbox
          name="reportCopyOrganizer"
          label={t("fields.reportCopyOrganizer")}
          defaultChecked={values.reportCopyOrganizer}
        />
      </fieldset>

      {editing ? (
        <Checkbox name="active" label={t("fields.active")} defaultChecked={values.active} />
      ) : null}

      {state && !state.ok ? (
        <p role="alert" className="rounded-control bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
          {t(`errors.${state.error}`)}
        </p>
      ) : state?.ok && editing ? (
        <p role="status" className="rounded-control bg-primary/10 px-3.5 py-2.5 text-sm text-primary">
          {ta("form.saved")}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? ta("form.saving") : editing ? ta("form.save") : t("create")}
      </Button>
    </form>
  );
}

/** Pourcentage ou montant par billet payant ; `inherit` propose de reprendre la règle du point de vente. */
export function CommissionInputs({
  prefix,
  kind,
  onKind,
  bps,
  fixedCents,
  inherit,
}: {
  prefix: string;
  kind: string;
  onKind: (kind: string) => void;
  bps: number;
  fixedCents: number;
  inherit?: string;
}) {
  const t = useTranslations("admin.resellers");
  const options = [
    ...(inherit ? [{ value: "INHERIT", label: inherit }] : []),
    { value: "PERCENT", label: t("kind.PERCENT") },
    { value: "FIXED_PER_TICKET", label: t("kind.FIXED_PER_TICKET") },
  ];
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="sr-only">{t("fields.commission")}</span>
        <select
          name={`${prefix}Kind`}
          value={kind}
          onChange={(e) => onKind(e.target.value)}
          className="h-11 rounded-control border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {kind === "PERCENT" ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            name={`${prefix}Percent`}
            inputMode="decimal"
            defaultValue={bps ? String(bps / 100) : ""}
            placeholder="0"
            aria-label={t("kind.PERCENT")}
            className="h-11 w-24 rounded-control border border-border bg-background px-3 text-right text-sm outline-none transition-colors focus:border-ring"
          />
          %
        </label>
      ) : kind === "FIXED_PER_TICKET" ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            name={`${prefix}Fixed`}
            inputMode="decimal"
            defaultValue={fixedCents ? (fixedCents / 100).toFixed(2) : ""}
            placeholder="0.00"
            aria-label={t("kind.FIXED_PER_TICKET")}
            className="h-11 w-28 rounded-control border border-border bg-background px-3 text-right text-sm outline-none transition-colors focus:border-ring"
          />
          {t("perTicketSuffix")}
        </label>
      ) : null}
    </div>
  );
}
