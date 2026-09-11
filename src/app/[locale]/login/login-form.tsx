"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LogIn, Mail, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { login, type LoginState } from "@/lib/auth/actions";

/**
 * Le formulaire appelle directement l'action serveur : les identifiants ne
 * transitent pas par une route d'API exposée, et la vérification reste
 * inaccessible depuis le navigateur.
 */
export function LoginForm({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<LoginState | undefined, FormData>(
    login,
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      {/* La destination suit le formulaire pour ramener la personne là où
          elle voulait aller ; l'action n'accepte qu'un chemin interne. */}
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("email")}</span>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            autoFocus
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
            autoComplete="current-password"
            className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm outline-none focus:border-ring"
          />
        </div>
      </label>

      {state?.error ? (
        // `role="alert"` fait annoncer l'échec par les lecteurs d'écran, qui
        // ne verraient pas apparaître le message autrement.
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
        >
          {t(state.error)}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        <LogIn className="size-4" />
        {pending ? t("pending") : t("submit")}
      </Button>
    </form>
  );
}
