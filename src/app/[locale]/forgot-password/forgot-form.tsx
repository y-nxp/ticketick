"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { MailCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  requestPasswordReset,
  type DemandeState,
} from "@/lib/auth/reset-actions";

export function ForgotForm({ defaultEmail }: { defaultEmail?: string }) {
  const t = useTranslations("auth.forgot");
  const [state, action, pending] = useActionState<DemandeState, FormData>(
    requestPasswordReset,
    undefined,
  );

  // Confirmation identique que le compte existe ou non : indiquer qu'une
  // adresse est inconnue permettrait d'énumérer les comptes.
  if (state && "ok" in state) {
    return (
      <div className="space-y-4">
        <p
          role="status"
          className="flex items-start gap-2.5 rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary"
        >
          <MailCheck className="mt-0.5 size-4 shrink-0" />
          {t("sent")}
        </p>
        <p className="text-sm text-muted-foreground">{t("sentHint")}</p>
        <Link href="/login">
          <Button variant="outline">{t("backToLogin")}</Button>
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("email")}</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          defaultValue={defaultEmail}
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
        />
      </label>

      {state && "error" in state ? (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
        >
          {t(state.error)}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? t("pending") : t("submit")}
      </Button>

      <p className="text-center text-sm">
        <Link href="/login" className="text-primary hover:underline">
          {t("backToLogin")}
        </Link>
      </p>
    </form>
  );
}
