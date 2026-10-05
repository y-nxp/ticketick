"use client";

import { useTranslations } from "next-intl";
import { Save } from "lucide-react";
import { useKeptForm } from "@/components/admin/use-kept-form";
import { Button } from "@/components/ui/button";
import { saveStripeAccount } from "@/lib/admin/stripe-actions";

const fieldClass =
  "h-11 rounded-control border border-border bg-background px-3.5 text-sm outline-none focus:border-ring";

export function StripeForm({
  organizerId,
  account,
}: {
  organizerId: string;
  account: { enabled: boolean } | null;
}) {
  const t = useTranslations("admin.payments.stripe");
  const { state, pending, formProps } = useKeptForm(saveStripeAccount);

  return (
    <form {...formProps} className="mt-5 grid gap-4">
      <input type="hidden" name="organizerId" value={organizerId} />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("secretKey")}</span>
        <input
          type="password"
          name="secretKey"
          required={!account}
          autoComplete="new-password"
          spellCheck={false}
          placeholder={account ? t("secretKeep") : "sk_live_…"}
          className={`${fieldClass} font-mono`}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={account?.enabled ?? true}
          className="size-4 accent-[var(--primary)]"
        />
        {t("enabledLabel")}
      </label>
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          <Save className="size-4" />
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
      {state?.ok ? (
        <p
          role="status"
          className={
            state.id === "savedNoWebhook" ? "text-sm text-[var(--warning)]" : "text-sm text-emerald-700"
          }
        >
          {t(state.id === "savedNoWebhook" ? "savedNoWebhook" : "saved")}
        </p>
      ) : null}
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${state.error}`)}
        </p>
      ) : null}
    </form>
  );
}
