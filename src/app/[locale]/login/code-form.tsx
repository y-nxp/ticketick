"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { KeyRound, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  resendLoginCode,
  restartLogin,
  verifyLoginCode,
  type CodeState,
} from "@/lib/auth/actions";

export function CodeForm() {
  const t = useTranslations("auth.code");
  const [state, action, pending] = useActionState<CodeState | undefined, FormData>(
    verifyLoginCode,
    undefined,
  );
  const [resent, resend, resending] = useActionState<CodeState | undefined>(
    resendLoginCode,
    undefined,
  );
  const latest = (resent?.at ?? 0) > (state?.at ?? 0) ? resent : state;
  const error = latest?.error;
  const expired = error === "expired";

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("label")}</span>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              autoFocus
              disabled={expired}
              className="h-12 w-full rounded-control border border-border bg-background pl-10 pr-3 text-lg tracking-[0.3em] tabular-nums outline-none focus:border-ring disabled:opacity-50"
            />
          </div>
        </label>

        {error ? (
          <p
            role="alert"
            className="rounded-control bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
          >
            {t(`errors.${error}`)}
          </p>
        ) : latest?.resent ? (
          <p role="status" className="rounded-control bg-muted px-3.5 py-2.5 text-sm">
            {t(`resent.${latest.resent}`)}
          </p>
        ) : null}

        {expired ? null : (
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            <LogIn className="size-4" />
            {pending ? t("pending") : t("submit")}
          </Button>
        )}
      </form>

      <p className="text-center text-sm text-muted-foreground">{t("spam")}</p>

      <div className="flex flex-col items-center gap-2 text-sm">
        {expired ? null : (
          <form action={resend}>
            <button
              type="submit"
              disabled={resending}
              className="text-muted-foreground hover:text-primary hover:underline disabled:opacity-50"
            >
              {t("resend")}
            </button>
          </form>
        )}
        <form action={restartLogin}>
          <button
            type="submit"
            className={
              expired
                ? "font-medium text-primary hover:underline"
                : "text-muted-foreground hover:text-primary hover:underline"
            }
          >
            {t("restart")}
          </button>
        </form>
      </div>
    </div>
  );
}
