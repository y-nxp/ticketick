"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { UserPlus, Mail, Lock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { register, type RegisterState } from "@/lib/auth/register-actions";

export function RegisterForm({
  next,
  defaultEmail,
  defaultFirstName,
  defaultLastName,
}: {
  next?: string;
  defaultEmail?: string;
  defaultFirstName?: string;
  defaultLastName?: string;
}) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<
    RegisterState | undefined,
    FormData
  >(register, undefined);

  return (
    <form action={action} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="firstName"
          label={t("firstName")}
          autoComplete="given-name"
          defaultValue={defaultFirstName}
        />
        <Field
          name="lastName"
          label={t("lastName")}
          autoComplete="family-name"
          defaultValue={defaultLastName}
        />
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("email")}</span>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="email"
            name="email"
            required
            defaultValue={defaultEmail}
            autoComplete="email"
            className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm outline-none focus:border-ring"
          />
        </div>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("password")}</span>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="password"
            name="password"
            required
            minLength={12}
            autoComplete="new-password"
            className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm outline-none focus:border-ring"
          />
        </div>
        <span className="text-xs text-muted-foreground">{t("passwordHint")}</span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("confirmPassword")}</span>
        <input
          type="password"
          name="confirm"
          required
          minLength={12}
          autoComplete="new-password"
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
        />
      </label>

      <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 px-3.5 py-3 text-sm">
        <input
          type="checkbox"
          name="marketingOptIn"
          className="mt-0.5 size-4 rounded border-border"
        />
        <span>
          <span className="font-medium">{t("marketingOptIn")}</span>
          <span className="mt-0.5 block text-muted-foreground">
            {t("marketingOptInHint")}
          </span>
        </span>
      </label>

      {state?.error ? (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
        >
          {t(state.error)}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        <UserPlus className="size-4" />
        {pending ? t("signUpPending") : t("signUpSubmit")}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t("haveAccount")}{" "}
        <Link
          href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
          className="font-medium text-foreground hover:text-primary hover:underline"
        >
          {t("signIn")}
        </Link>
      </p>
    </form>
  );
}

function Field({
  name,
  label,
  autoComplete,
  defaultValue,
}: {
  name: string;
  label: string;
  autoComplete: string;
  defaultValue?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="text"
        name={name}
        required
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
      />
    </label>
  );
}
