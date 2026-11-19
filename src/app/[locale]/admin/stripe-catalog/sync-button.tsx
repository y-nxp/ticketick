"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncStripeCatalogAction, type CatalogSyncState } from "@/lib/admin/stripe-catalog-actions";

export function SyncButton({
  organizerId,
  eventId,
  label,
  variant = "default",
}: {
  organizerId: string;
  eventId?: string;
  label: string;
  variant?: "default" | "outline";
}) {
  const t = useTranslations("admin.stripeCatalog");
  const [state, action, pending] = useActionState<CatalogSyncState, FormData>(
    syncStripeCatalogAction,
    null,
  );

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="organizerId" value={organizerId} />
      {eventId ? <input type="hidden" name="eventId" value={eventId} /> : null}
      <Button type="submit" variant={variant} size={eventId ? "sm" : "lg"} disabled={pending}>
        <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} />
        {pending ? t("syncing") : label}
      </Button>
      {state?.ok ? (
        <p role="status" className={`text-sm ${state.failed ? "text-[var(--warning)]" : "text-emerald-700"}`}>
          {t("result", {
            created: state.created,
            updated: state.updated,
            archived: state.archived,
            unchanged: state.unchanged,
          })}
          {state.failed ? ` ${t("resultFailed", { failed: state.failed })}` : ""}
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
