"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select, TextArea } from "@/components/admin/fields";
import { useKeptForm } from "@/components/admin/use-kept-form";
import { saveReportSettings, sendReportNow } from "@/lib/admin/report-actions";
import type { FormState } from "@/lib/admin/types";

const SECTIONS = ["sales", "invitations", "remaining"] as const;

export function SendReportNow({
  organizerId,
  sections,
  label,
}: {
  organizerId: string;
  sections: readonly string[];
  label: string;
}) {
  const t = useTranslations("admin.reports");
  const [state, send, sending] = useActionState<FormState, FormData>(sendReportNow, undefined);
  return (
    <form action={send} className="space-y-2">
      <input type="hidden" name="organizerId" value={organizerId} />
      {sections.map((s) => (
        <input key={s} type="hidden" name="sections" value={s} />
      ))}
      <Button type="submit" variant="outline" disabled={sending}>
        <Send className="size-4" />
        {sending ? t("sending") : label}
      </Button>
      {state?.ok ? (
        <p role="status" className="text-sm text-primary">
          {t("sent", { emails: state.id ?? "" })}
        </p>
      ) : state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${state.error}`)}
        </p>
      ) : null}
    </form>
  );
}

export function ReportSettings({
  organizerId,
  frequency,
  weekday,
  hour,
  weekdays,
  emails,
  sections,
  fallback,
}: {
  organizerId: string;
  frequency: string;
  weekday: number;
  hour: number;
  weekdays: readonly { value: string; label: string }[];
  emails: string;
  sections: readonly string[];
  fallback: string;
}) {
  const t = useTranslations("admin.reports");
  const { state, pending, formProps } = useKeptForm(saveReportSettings);

  return (
    <form {...formProps} className="space-y-4 border-t border-border pt-5">
      <input type="hidden" name="organizerId" value={organizerId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("frequency")} hint={t("frequencyHint")}>
          <Select
            key={frequency}
            name="frequency"
            defaultValue={frequency}
            options={(["NONE", "DAILY", "WEEKLY"] as const).map((v) => ({
              value: v,
              label: t(`frequencies.${v}`),
            }))}
          />
        </Field>
        <Field label={t("weekday")} hint={t("weekdayHint")}>
          <Select key={weekday} name="weekday" defaultValue={String(weekday)} options={weekdays} />
        </Field>
        <Field label={t("hour")}>
          <Select
            key={hour}
            name="hour"
            defaultValue={String(hour)}
            options={Array.from({ length: 24 }, (_, h) => ({
              value: String(h),
              label: `${String(h).padStart(2, "0")}:00`,
            }))}
          />
        </Field>
      </div>
      <Field
        label={t("emails")}
        hint={fallback ? t("emailsHint", { emails: fallback }) : t("emailsHintEmpty")}
      >
        <TextArea name="emails" rows={3} defaultValue={emails} />
      </Field>
      <fieldset key={sections.join(",")} className="space-y-2">
        <legend className="text-sm font-medium">{t("sections")}</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {SECTIONS.map((s) => (
            <Checkbox
              key={s}
              name="sections"
              value={s}
              label={t(`views.${s}`)}
              defaultChecked={sections.includes(s)}
            />
          ))}
        </div>
      </fieldset>
      {state?.ok ? (
        <p role="status" className="rounded-control bg-primary/10 px-3.5 py-2.5 text-sm text-primary">
          {t("saved")}
        </p>
      ) : state && !state.ok ? (
        <p role="alert" className="rounded-control bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
          {t(`errors.${state.error}`)}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {t("save")}
      </Button>
    </form>
  );
}
