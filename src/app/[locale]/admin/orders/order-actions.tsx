"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Banknote, Download } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { markOrderPaidCash } from "@/lib/admin/order-actions";
import type { FormState } from "@/lib/admin/types";

export function OrderActions({
  orderId,
  reference,
  canMarkCash,
  canDownload,
}: {
  orderId: string;
  reference: string;
  canMarkCash: boolean;
  canDownload: boolean;
}) {
  const t = useTranslations("admin.orders");
  const [state, action, pending] = useActionState<FormState, FormData>(
    markOrderPaidCash,
    undefined,
  );

  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-wrap gap-2">
        {canDownload ? (
          <a
            href={`/api/tickets/pdf?ref=${encodeURIComponent(reference)}`}
            className={buttonVariants({ variant: "outline" })}
          >
            <Download />
            {t("download")}
          </a>
        ) : null}
        {canMarkCash ? (
          <form action={action}>
            <input type="hidden" name="orderId" value={orderId} />
            <Button type="submit" disabled={pending}>
              <Banknote />
              {pending ? t("markCashPending") : t("markCash")}
            </Button>
          </form>
        ) : null}
      </div>
      {canDownload ? (
        <p className="text-xs text-muted-foreground">{t("downloadHint")}</p>
      ) : null}
      {canMarkCash ? (
        <p className="text-xs text-muted-foreground">{t("markCashHint")}</p>
      ) : null}
      {state?.ok ? (
        <p className="text-sm text-emerald-700">{t("cashDone")}</p>
      ) : null}
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${state.error}`)}
        </p>
      ) : null}
    </div>
  );
}
