"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  resendVerification,
  type ResendState,
} from "@/lib/auth/verification-actions";

export function VerifyBanner({ email }: { email: string }) {
  const t = useTranslations("verifyEmail");
  const [state, action, pending] = useActionState<ResendState, FormData>(
    resendVerification,
    undefined,
  );

  return (
    <div className="mt-8 flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-4">
      <MailCheck className="size-5 shrink-0 text-foreground" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{t("bannerTitle")}</p>
        <p className="text-sm text-muted-foreground">
          {t("bannerBody", { email })}
        </p>
        {state ? (
          <p role="status" className="mt-1 text-sm font-medium">
            {"ok" in state ? t("sent") : t(state.error)}
          </p>
        ) : null}
      </div>
      <form action={action}>
        <Button type="submit" variant="outline" disabled={pending}>
          {t("resend")}
        </Button>
      </form>
    </div>
  );
}
