"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveTillTwintNumber, type TwintNumberState } from "@/lib/admin/stripe-catalog-actions";

/** Caisse sur place : numéro TWINT montré au client pour payer. */
export function TwintNumberForm({ organizerId, number }: { organizerId: string; number: string | null }) {
  const t = useTranslations("admin.stripeCatalog.twint");
  const [state, action, pending] = useActionState<TwintNumberState, FormData>(saveTillTwintNumber, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="organizerId" value={organizerId} />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("label")}</span>
        <span className="text-xs text-muted-foreground">{t("hint")}</span>
        <span className="flex gap-2">
          <input
            name="twintNumber"
            type="tel"
            defaultValue={number ?? ""}
            placeholder="079 123 45 67"
            className="h-10 w-48 rounded-control border border-border bg-background px-3 text-sm tabular-nums"
          />
          <Button type="submit" variant="outline" disabled={pending}>
            <Save className="size-4" />
            {t("save")}
          </Button>
        </span>
      </label>
      {state?.ok ? <p className="text-sm text-emerald-700">{t("saved")}</p> : null}
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {t("error")}
        </p>
      ) : null}
    </form>
  );
}
