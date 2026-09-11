"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { resetPassword, type ResetState } from "@/lib/auth/reset-actions";

export function ResetForm({ token }: { token: string }) {
  const t = useTranslations("auth.reset");
  // En cas de réussite, l'action ouvre une session et redirige elle-même vers
  // le compte : le formulaire n'a que les échecs à afficher.
  const [state, action, pending] = useActionState<ResetState, FormData>(
    resetPassword,
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <Champ name="next" label={t("next")} />
      <Champ name="confirm" label={t("confirm")} />

      <p className="text-xs text-muted-foreground">{t("hint")}</p>

      {state?.error ? (
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
    </form>
  );
}

function Champ({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="password"
        name={name}
        required
        minLength={12}
        autoComplete="new-password"
        className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
      />
    </label>
  );
}
