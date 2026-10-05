"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Trash2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { SeatLegend, SeatMap } from "@/components/seating/seat-map";
import { deleteSeatPlan, duplicateSeatPlan } from "@/lib/admin/seat-plan-actions";
import type { FormState } from "@/lib/admin/types";
import type { SeatLayout } from "@/lib/seating/layout";

export function PlanPreview({ layout, locale }: { layout: SeatLayout; locale: string }) {
  return (
    <div className="space-y-4">
      <SeatLegend layout={layout} locale={locale} zonePrices={{}} />
      <SeatMap layout={layout} locale={locale} stateOf={() => "free"} onToggle={() => {}} />
    </div>
  );
}

/** Autre disposition de la même salle : la copie s'ouvre dans l'éditeur. */
export function DuplicatePlan({ id, name }: { id: string; name: string }) {
  const t = useTranslations("admin.seatPlans");
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, data) => {
    const result = await duplicateSeatPlan(prev, data);
    if (result?.ok && result.id) router.push(`/admin/seat-plans/${result.id}/edit`);
    return result;
  }, undefined);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input
        name="name"
        defaultValue={name}
        required
        minLength={2}
        maxLength={120}
        aria-label={t("copyNameLabel")}
        className="h-10 w-64 rounded-control border border-border bg-background px-3 text-sm outline-none focus:border-ring"
      />
      <Button type="submit" variant="outline" disabled={pending}>
        <Copy />
        {t("duplicate")}
      </Button>
      {state && !state.ok ? (
        <p role="alert" className="w-full text-sm text-destructive">
          {t(`errors.${state.error}`)}
        </p>
      ) : null}
    </form>
  );
}

export function DeletePlan({ id, inUse }: { id: string; inUse: boolean }) {
  const t = useTranslations("admin.seatPlans");
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, data) => {
    const result = await deleteSeatPlan(prev, data);
    if (result?.ok) router.push("/admin/seat-plans");
    return result;
  }, undefined);

  if (inUse) {
    return <p className="text-sm text-muted-foreground">{t("inUse")}</p>;
  }
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(t("deleteConfirm"))) e.preventDefault();
      }}
      className="space-y-2"
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="outline" disabled={pending}>
        <Trash2 className="size-4" />
        {t("delete")}
      </Button>
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${state.error}`)}
        </p>
      ) : null}
    </form>
  );
}
