"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { QrCode, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { posNewPayLink } from "@/lib/resellers/actions";
import type { PosPayLinkState } from "@/lib/resellers/types";

/** Paiement en ligne en attente : nouveau QR à montrer, ou vérifier s'il est payé. */
export function PayLinkPanel({ orderId }: { orderId: string }) {
  const t = useTranslations("pos.sales");
  const router = useRouter();
  const [state, action, pending] = useActionState<PosPayLinkState, FormData>(
    posNewPayLink,
    undefined,
  );
  return (
    <section className="space-y-3 rounded-card border border-border bg-card p-6">
      <h2 className="text-lg">{t("pendingTitle")}</h2>
      <p className="text-sm text-muted-foreground">{t("pendingHint")}</p>
      {state?.ok ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- QR en data URL */}
          <img
            src={state.payQr}
            alt={t("payQrAlt")}
            width={260}
            height={260}
            className="rounded-control border border-border bg-white p-2"
          />
          <p className="break-all text-xs text-muted-foreground">{state.payUrl}</p>
        </>
      ) : state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {t("payLinkGone")}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <form action={action}>
          <input type="hidden" name="orderId" value={orderId} />
          <Button type="submit" variant="outline" disabled={pending}>
            <QrCode className="size-4" />
            {t("newQr")}
          </Button>
        </form>
        <Button type="button" variant="ghost" onClick={() => router.refresh()}>
          <RefreshCw className="size-4" />
          {t("refresh")}
        </Button>
      </div>
    </section>
  );
}
