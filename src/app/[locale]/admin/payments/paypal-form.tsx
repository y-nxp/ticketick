"use client";

import { useTranslations } from "next-intl";
import { Save } from "lucide-react";
import { useKeptForm } from "@/components/admin/use-kept-form";
import { Button } from "@/components/ui/button";
import { savePaypalAccount } from "@/lib/admin/paypal-actions";

const fieldClass =
  "h-11 rounded-xl border border-border bg-background px-3.5 text-sm outline-none focus:border-ring";

export function PaypalForm({
  organizerId,
  account,
}: {
  organizerId: string;
  account: {
    payeeEmail: string;
    clientId: string;
    live: boolean;
    enabled: boolean;
  } | null;
}) {
  const t = useTranslations("admin.paypal");
  const { state, pending, formProps } = useKeptForm(savePaypalAccount);

  return (
    <form {...formProps} className="mt-5 grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="organizerId" value={organizerId} />
      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-sm font-medium">{t("payeeEmail")}</span>
        <input
          type="email"
          name="payeeEmail"
          required
          defaultValue={account?.payeeEmail ?? ""}
          className={fieldClass}
        />
        <span className="text-xs text-muted-foreground">{t("payeeEmailHint")}</span>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("clientId")}</span>
        <input
          type="text"
          name="clientId"
          required
          autoComplete="off"
          spellCheck={false}
          defaultValue={account?.clientId ?? ""}
          className={`${fieldClass} font-mono`}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("secret")}</span>
        <input
          type="password"
          name="secret"
          required={!account}
          autoComplete="new-password"
          placeholder={account ? t("secretKeep") : ""}
          className={`${fieldClass} font-mono`}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="live"
          defaultChecked={account?.live ?? true}
          className="size-4 accent-[var(--primary)]"
        />
        {t("liveLabel")}
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
      <div className="sm:col-span-2">
        <Button type="submit" size="lg" disabled={pending}>
          <Save className="size-4" />
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
      {state?.ok ? (
        <p className="text-sm text-emerald-700 sm:col-span-2">{t("saved")}</p>
      ) : null}
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive sm:col-span-2">
          {t(`errors.${state.error}`)}
        </p>
      ) : null}
    </form>
  );
}
