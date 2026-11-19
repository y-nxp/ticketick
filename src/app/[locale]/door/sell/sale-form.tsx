"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { CreditCard, Loader2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { startDoorSale, type DoorSaleState } from "@/lib/door/sale-actions";
import { formatPrice } from "@/lib/utils";

export interface SaleFormTariff {
  id: string;
  name: string;
  priceCents: number;
  left: number;
}

export function DoorSaleForm({
  sessionId,
  tariffs,
  locale,
}: {
  sessionId: string;
  tariffs: SaleFormTariff[];
  locale: string;
}) {
  const t = useTranslations("door.sell");
  const router = useRouter();
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});
  const [state, action, pending] = useActionState<DoorSaleState, FormData>(startDoorSale, null);

  React.useEffect(() => {
    if (!state?.ok) return;
    if (state.kind === "collect") {
      // Collect s'ouvre, encaisse sur le lecteur, puis revient sur ticketick.
      window.location.href = state.url;
    } else {
      router.push(`/door/sell/order/${state.orderId}`);
    }
  }, [state, router]);

  const intl = `${locale}-CH`;
  const total = tariffs.reduce((sum, tt) => sum + tt.priceCents * (quantities[tt.id] ?? 0), 0);
  const count = Object.values(quantities).reduce((a, b) => a + b, 0);
  const change = (id: string, delta: number, max: number) =>
    setQuantities((q) => ({ ...q, [id]: Math.max(0, Math.min(max, (q[id] ?? 0) + delta)) }));
  // Collect est en train de s'ouvrir : on ne revend pas en double.
  const busy = pending || (state?.ok === true && state.kind === "collect");

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="sessionId" value={sessionId} />
      <ul className="divide-y divide-border rounded-card border border-border bg-card">
        {tariffs.map((tt) => {
          const qty = quantities[tt.id] ?? 0;
          const max = Math.min(tt.left, 30);
          const failed = state && !state.ok && state.ticketTypeId === tt.id;
          return (
            <li key={tt.id} className="flex items-center gap-3 px-4 py-3">
              <input type="hidden" name={`qty:${tt.id}`} value={qty} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{tt.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatPrice(tt.priceCents, intl)} ·{" "}
                  {tt.left > 0 ? t("left", { count: tt.left }) : t("soldOut")}
                </p>
                {failed ? <p className="text-sm text-destructive">{t(`errors.${state.error}`)}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => change(tt.id, -1, max)}
                disabled={qty === 0 || busy}
                aria-label={t("less", { tariff: tt.name })}
                className="grid size-11 place-items-center rounded-full border border-border disabled:opacity-40"
              >
                <Minus className="size-5" />
              </button>
              <span className="w-8 text-center text-lg font-semibold tabular-nums" aria-live="polite">
                {qty}
              </span>
              <button
                type="button"
                onClick={() => change(tt.id, 1, max)}
                disabled={qty >= max || busy}
                aria-label={t("more", { tariff: tt.name })}
                className="grid size-11 place-items-center rounded-full border border-border disabled:opacity-40"
              >
                <Plus className="size-5" />
              </button>
            </li>
          );
        })}
      </ul>

      {state && !state.ok && !state.ticketTypeId ? (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${state.error}`)}
        </p>
      ) : null}

      <div className="sticky bottom-0 -mx-4 border-t border-border bg-background/95 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 backdrop-blur">
        <Button type="submit" size="lg" className="h-14 w-full text-base" disabled={count === 0 || busy}>
          {busy ? <Loader2 className="size-5 animate-spin" /> : <CreditCard className="size-5" />}
          {count === 0
            ? t("chooseTariff")
            : total === 0
              ? t("recordFree", { count })
              : t("charge", { amount: formatPrice(total, intl) })}
        </Button>
        {total > 0 ? <p className="mt-2 text-center text-xs text-muted-foreground">{t("collectHint")}</p> : null}
      </div>
    </form>
  );
}
