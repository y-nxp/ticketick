"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { cancelSale, type CancelSaleState } from "@/lib/door/sale-actions";

/**
 * Annuler une vente de la caisse : on donne la raison, puis on confirme.
 * Carte en ligne : remboursée chez Stripe ; sinon la caisse rend l'argent.
 */
export function CancelSale({ saleId, provider, compact = false }: { saleId: string; provider: string; compact?: boolean }) {
  const t = useTranslations("door.sell.cancel");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [state, action, pending] = useActionState<CancelSaleState, FormData>(cancelSale, null);

  React.useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  if (state?.ok) {
    return <p className="text-sm font-medium text-destructive">{state.refunded ? t("doneRefunded") : t("done")}</p>;
  }
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          compact
            ? "inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-destructive"
            : "inline-flex h-11 items-center justify-center gap-1.5 rounded-control border border-border px-4 text-sm font-medium text-muted-foreground hover:border-destructive hover:text-destructive"
        }
      >
        <Undo2 className={compact ? "size-3.5" : "size-4"} />
        {t("button")}
      </button>
    );
  }
  return (
    <form action={action} className="space-y-2 rounded-card border border-destructive/40 bg-destructive/5 p-3 text-left">
      <input type="hidden" name="saleId" value={saleId} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t("reason")}</span>
        <input
          name="reason"
          required
          maxLength={200}
          autoFocus
          placeholder={t("reasonPlaceholder")}
          className="h-10 rounded-control border border-border bg-background px-3 text-sm"
        />
      </label>
      <p className="text-xs text-muted-foreground">{provider === "collect" ? t("refundHint") : t("giveBackHint")}</p>
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${state.error}`)}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending} className="bg-destructive text-white shadow-none hover:bg-destructive/90 dark:bg-none">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
          {t("confirm")}
        </Button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted-foreground underline">
          {t("keep")}
        </button>
      </div>
    </form>
  );
}
