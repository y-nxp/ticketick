"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { saveDoorTill, type CatalogSyncState } from "@/lib/admin/stripe-catalog-actions";

/** Case « Caisse à l'entrée », enregistrée dès qu'on la coche ou la décoche. */
export function TillToggle({ organizerId, enabled }: { organizerId: string; enabled: boolean }) {
  const t = useTranslations("admin.stripeCatalog.till");
  const [state, action, pending] = useActionState<CatalogSyncState, FormData>(saveDoorTill, null);
  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="organizerId" value={organizerId} />
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="doorTill"
          defaultChecked={enabled}
          disabled={pending}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="mt-0.5 size-4 accent-[var(--primary)]"
        />
        <span>
          <span className="font-medium">{t("label")}</span>
          <span className="block text-xs text-muted-foreground">{t("hint")}</span>
        </span>
      </label>
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {t("error")}
        </p>
      ) : null}
    </form>
  );
}
