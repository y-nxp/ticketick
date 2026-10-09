"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Select, TextArea } from "@/components/admin/fields";
import { useKeptForm } from "@/components/admin/use-kept-form";
import { saveInviteReport, sendInviteReportNow } from "@/lib/admin/invitation-actions";
import type { FormState } from "@/lib/admin/types";

export function InviteReportSettings({
  organizerId,
  frequency,
  emails,
  fallback,
}: {
  organizerId: string;
  frequency: string;
  emails: string;
  fallback: string;
}) {
  const t = useTranslations("admin.invitations");
  const { state, pending, formProps } = useKeptForm(saveInviteReport);
  const [sendState, send, sending] = useActionState<FormState, FormData>(sendInviteReportNow, undefined);

  return (
    <div className="space-y-5">
      <form action={send} className="space-y-2">
        <input type="hidden" name="organizerId" value={organizerId} />
        <Button type="submit" variant="outline" disabled={sending}>
          <Send className="size-4" />
          {sending ? t("sending") : t("sendNow")}
        </Button>
        {sendState?.ok ? (
          <p role="status" className="text-sm text-primary">
            {t("sent", { emails: sendState.id ?? "" })}
          </p>
        ) : sendState && !sendState.ok ? (
          <p role="alert" className="text-sm text-destructive">
            {t(`errors.${sendState.error}`)}
          </p>
        ) : null}
      </form>

      <form {...formProps} className="space-y-4 border-t border-border pt-5">
        <input type="hidden" name="organizerId" value={organizerId} />
        <div className="grid gap-4 sm:grid-cols-2">
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
          <Field
            label={t("emails")}
            hint={fallback ? t("emailsHint", { emails: fallback }) : t("emailsHintEmpty")}
          >
            <TextArea name="emails" rows={3} defaultValue={emails} />
          </Field>
        </div>
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
    </div>
  );
}
