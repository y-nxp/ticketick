"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { UserRound, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  updateProfile,
  type ProfileState,
} from "@/lib/auth/profile-actions";

export function ProfileForm({
  email,
  firstName,
  lastName,
  phone,
  role,
}: {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  role?: string;
}) {
  const t = useTranslations("account");
  const [state, action, pending] = useActionState<
    ProfileState | undefined,
    FormData
  >(updateProfile, undefined);

  return (
    <section className="rounded-card border border-border bg-card p-6">
      <h2 className="flex items-center gap-2 font-semibold">
        <UserRound className="size-4 text-muted-foreground" />
        {t("profile")}
      </h2>

      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-muted-foreground">{t("email")}</dt>
          <dd className="font-medium">{email}</dd>
        </div>
        {role ? (
          <div>
            <dt className="text-muted-foreground">{t("role")}</dt>
            <dd>
              <Badge variant="secondary">{role}</Badge>
            </dd>
          </div>
        ) : null}
      </dl>

      <form action={action} className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            name="firstName"
            label={t("details.firstName")}
            autoComplete="given-name"
            defaultValue={state?.values?.firstName ?? firstName}
            required
          />
          <Field
            name="lastName"
            label={t("details.lastName")}
            autoComplete="family-name"
            defaultValue={state?.values?.lastName ?? lastName}
            required
          />
        </div>
        <Field
          name="phone"
          type="tel"
          label={t("details.phone")}
          autoComplete="tel"
          defaultValue={state?.values?.phone ?? phone}
        />

        {state?.error ? (
          <p
            role="alert"
            className="rounded-control bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
          >
            {t(`details.${state.error}`)}
          </p>
        ) : null}

        {state?.ok ? (
          <p
            role="status"
            className="flex items-center gap-2 rounded-control bg-primary/10 px-3.5 py-2.5 text-sm text-primary"
          >
            <Check className="size-4 shrink-0" />
            {t("details.done")}
          </p>
        ) : null}

        <Button type="submit" disabled={pending}>
          {pending ? t("details.pending") : t("details.submit")}
        </Button>
      </form>
    </section>
  );
}

function Field({
  name,
  label,
  autoComplete,
  defaultValue,
  type = "text",
  required = false,
}: {
  name: string;
  label: string;
  autoComplete: string;
  defaultValue: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input
        type={type}
        name={name}
        required={required}
        maxLength={name === "phone" ? 40 : 80}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        className="h-11 w-full rounded-control border border-border bg-background px-3 text-sm outline-none focus:border-ring"
      />
    </label>
  );
}
