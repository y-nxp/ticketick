"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { KeyRound, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  changePassword,
  type PasswordState,
} from "@/lib/auth/password-actions";

export function PasswordForm() {
  const t = useTranslations("account.password");
  const [state, action, pending] = useActionState<
    PasswordState | undefined,
    FormData
  >(changePassword, undefined);

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <h2 className="flex items-center gap-2 font-semibold">
        <KeyRound className="size-4 text-muted-foreground" />
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>

      <form action={action} className="mt-4 space-y-3">
        <Field name="current" label={t("current")} autoComplete="current-password" />
        <Field name="next" label={t("next")} autoComplete="new-password" />
        <Field name="confirm" label={t("confirm")} autoComplete="new-password" />

        {state?.error ? (
          <p
            role="alert"
            className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
          >
            {t(state.error)}
          </p>
        ) : null}

        {state?.ok ? (
          <p
            role="status"
            className="flex items-center gap-2 rounded-xl bg-primary/10 px-3.5 py-2.5 text-sm text-primary"
          >
            <Check className="size-4 shrink-0" />
            {t("done")}
          </p>
        ) : null}

        <Button type="submit" disabled={pending}>
          {pending ? t("pending") : t("submit")}
        </Button>
      </form>
    </section>
  );
}

function Field({
  name,
  label,
  autoComplete,
}: {
  name: string;
  label: string;
  autoComplete: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="password"
        name={name}
        required
        autoComplete={autoComplete}
        className="h-11 w-full max-w-sm rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
      />
    </label>
  );
}
