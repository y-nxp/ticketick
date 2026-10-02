"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/admin/types";
import { startPayAction } from "@/lib/orders/pay-actions";

export function PayButton({
  token,
  locale,
  amount,
}: {
  token: string;
  locale: string;
  amount: string;
}) {
  const t = useTranslations("pay");
  const [state, action, pending] = useActionState<FormState, FormData>(
    startPayAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        <CreditCard className="size-4" />
        {pending ? t("opening") : t("payButton", { amount })}
      </Button>
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${state.error}`)}
        </p>
      ) : null}
    </form>
  );
}
