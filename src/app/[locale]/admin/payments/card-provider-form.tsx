"use client";

import { useTranslations } from "next-intl";
import { Save } from "lucide-react";
import { useKeptForm } from "@/components/admin/use-kept-form";
import { Button } from "@/components/ui/button";
import { saveCardProvider } from "@/lib/admin/stripe-actions";

const PROVIDERS = ["postfinance", "stripe"] as const;

export function CardProviderForm({
  organizerId,
  preferred,
  configured,
}: {
  organizerId: string;
  preferred: "postfinance" | "stripe";
  configured: Record<(typeof PROVIDERS)[number], boolean>;
}) {
  const t = useTranslations("admin.payments.cardProvider");
  const { state, pending, formProps } = useKeptForm(saveCardProvider);

  return (
    <form {...formProps} className="mt-4 grid gap-4">
      <input type="hidden" name="organizerId" value={organizerId} />
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {PROVIDERS.map((provider) => (
          <label key={provider} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="cardProvider"
              value={provider}
              defaultChecked={preferred === provider}
              className="size-4 accent-[var(--primary)]"
            />
            {configured[provider]
              ? t(provider)
              : t("notConfigured", { provider: t(provider) })}
          </label>
        ))}
      </div>
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          <Save className="size-4" />
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
      {state?.ok ? (
        <p role="status" className="text-sm text-emerald-700">
          {t("saved")}
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
