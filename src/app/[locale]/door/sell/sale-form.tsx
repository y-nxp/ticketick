"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { CreditCard, ExternalLink, Loader2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { startDoorSale, type DoorSaleState } from "@/lib/door/sale-actions";
import { formatPrice } from "@/lib/utils";

export interface SaleFormTariff {
  id: string;
  name: string;
  priceCents: number;
  /** Déjà vendus à la caisse pour ce concert. */
  soldAtTill: number;
}

/** Plafond d'une ligne : bien au-delà d'une vente au guichet. */
const MAX_PER_LINE = 50;

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
  const [quantities, setQuantities] = React.useState<Record<string, number>>(
    {},
  );
  const [state, action, pending] = useActionState<DoorSaleState, FormData>(
    startDoorSale,
    null,
  );

  // Vente gratuite : comptée tout de suite.
  React.useEffect(() => {
    if (state?.ok && state.kind === "done")
      router.push(`/door/sell/sale/${state.saleId}`);
  }, [state, router]);
  // Vente prête pour Collect. Le lien doit être touché : ouvert par le script,
  // l'iPhone affiche la page web de Collect au lieu d'ouvrir l'app.
  const [dismissed, setDismissed] = React.useState<DoorSaleState>(null);
  const ready =
    state?.ok && state.kind === "collect" && state !== dismissed ? state : null;

  const intl = `${locale}-CH`;
  const total = tariffs.reduce(
    (sum, tt) => sum + tt.priceCents * (quantities[tt.id] ?? 0),
    0,
  );
  const count = Object.values(quantities).reduce((a, b) => a + b, 0);
  const change = (id: string, delta: number) =>
    setQuantities((q) => ({
      ...q,
      [id]: Math.max(0, Math.min(MAX_PER_LINE, (q[id] ?? 0) + delta)),
    }));
  // Lien Collect affiché : la vente ne se modifie plus sans repartir.
  const busy = pending || ready != null;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="sessionId" value={sessionId} />
      <ul className="divide-y divide-border rounded-card border border-border bg-card">
        {tariffs.map((tt) => {
          const qty = quantities[tt.id] ?? 0;
          const failed = state && !state.ok && state.ticketTypeId === tt.id;
          return (
            <li key={tt.id} className="flex items-center gap-3 px-4 py-3">
              <input type="hidden" name={`qty:${tt.id}`} value={qty} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{tt.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatPrice(tt.priceCents, intl)}
                  {tt.soldAtTill > 0
                    ? ` · ${t("soldAtTill", { count: tt.soldAtTill })}`
                    : ""}
                </p>
                {failed ? (
                  <p className="text-sm text-destructive">
                    {t(`errors.${state.error}`)}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => change(tt.id, -1)}
                disabled={qty === 0 || busy}
                aria-label={t("less", { tariff: tt.name })}
                className="grid size-11 place-items-center rounded-full border border-border disabled:opacity-40"
              >
                <Minus className="size-5" />
              </button>
              <span
                className="w-8 text-center text-lg font-semibold tabular-nums"
                aria-live="polite"
              >
                {qty}
              </span>
              <button
                type="button"
                onClick={() => change(tt.id, 1)}
                disabled={qty >= MAX_PER_LINE || busy}
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
        {ready ? (
          <div className="space-y-2">
            <a
              href={ready.url}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-control bg-primary text-base font-medium text-primary-foreground shadow-sm"
            >
              <ExternalLink className="size-5" />
              {t("openCollect", { amount: formatPrice(total, intl) })}
            </a>
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => setDismissed(ready)}
                className="text-muted-foreground underline"
              >
                {t("editSale")}
              </button>
              <a
                href={ready.webUrl}
                className="text-muted-foreground underline"
              >
                {t("collectFallback")}
              </a>
            </div>
          </div>
        ) : (
          <Button
            type="submit"
            size="lg"
            className="h-14 w-full text-base"
            disabled={count === 0 || busy}
          >
            {busy ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <CreditCard className="size-5" />
            )}
            {count === 0
              ? t("chooseTariff")
              : total === 0
                ? t("recordFree", { count })
                : t("charge", { amount: formatPrice(total, intl) })}
          </Button>
        )}
        {total > 0 ? (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {t("collectHint")}
          </p>
        ) : null}
      </div>
    </form>
  );
}
