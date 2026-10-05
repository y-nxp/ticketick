"use client";

import { useTranslations } from "next-intl";
import { Save } from "lucide-react";
import { useKeptForm } from "@/components/admin/use-kept-form";
import { Button } from "@/components/ui/button";
import { saveBankAccount } from "@/lib/admin/payment-actions";

const fieldClass =
  "h-11 rounded-control border border-border bg-background px-3.5 text-sm outline-none focus:border-ring";

export function BankForm({
  organizerId,
  bank,
}: {
  organizerId: string;
  bank: { iban: string; beneficiary: string };
}) {
  const t = useTranslations("admin.payments.bank");
  const { state, pending, formProps } = useKeptForm(saveBankAccount);

  return (
    <form {...formProps} className="mt-5 grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="organizerId" value={organizerId} />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("iban")}</span>
        <input
          type="text"
          name="iban"
          autoComplete="off"
          spellCheck={false}
          placeholder="CH00 0000 0000 0000 0000 0"
          defaultValue={bank.iban}
          className={`${fieldClass} font-mono`}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("beneficiary")}</span>
        <input
          type="text"
          name="beneficiary"
          autoComplete="off"
          defaultValue={bank.beneficiary}
          className={fieldClass}
        />
      </label>
      <p className="text-xs text-muted-foreground sm:col-span-2">{t("hint")}</p>
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
