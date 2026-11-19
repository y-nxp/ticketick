"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Banknote, CreditCard, ExternalLink, Loader2, Minus, Plus, Smartphone } from "lucide-react";
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

/** Étape du bas de l'écran : choix du moyen, ou confirmation TWINT / espèces. */
type Step = "choose" | "twint" | "cash";

export function DoorSaleForm({
  sessionId,
  tariffs,
  locale,
  twintNumber,
}: {
  sessionId: string;
  tariffs: SaleFormTariff[];
  locale: string;
  twintNumber: string | null;
}) {
  const t = useTranslations("door.sell");
  const router = useRouter();
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});
  const [step, setStep] = React.useState<Step>("choose");
  const [received, setReceived] = React.useState("");
  // Une clé par vente : un double appui sur « Encaissé » ne la compte qu'une fois.
  const [key] = React.useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState<DoorSaleState, FormData>(startDoorSale, null);

  // TWINT, espèces ou gratuit : vente comptée, on affiche le reçu.
  React.useEffect(() => {
    if (state?.ok && state.kind === "done") router.push(`/door/sell/sale/${state.saleId}`);
  }, [state, router]);
  // Carte : le lien Collect doit être touché ; ouvert par le script, l'iPhone
  // affiche la page web de Collect au lieu d'ouvrir l'app.
  const [dismissed, setDismissed] = React.useState<DoorSaleState>(null);
  const ready = state?.ok && state.kind === "collect" && state !== dismissed ? state : null;

  const intl = `${locale}-CH`;
  const money = (cents: number) => formatPrice(cents, intl);
  const total = tariffs.reduce((sum, tt) => sum + tt.priceCents * (quantities[tt.id] ?? 0), 0);
  const count = Object.values(quantities).reduce((a, b) => a + b, 0);
  const change = (id: string, delta: number) =>
    setQuantities((q) => ({ ...q, [id]: Math.max(0, Math.min(MAX_PER_LINE, (q[id] ?? 0) + delta)) }));
  const done = state?.ok === true && state.kind === "done";
  // Paiement en cours : la vente ne se modifie plus sans revenir en arrière.
  const locked = pending || done || ready != null || step !== "choose";
  const receivedCents = Math.round(Number(received.replace(",", ".")) * 100);
  const changeDue = Number.isFinite(receivedCents) && receivedCents >= total ? receivedCents - total : null;

  const back = () => {
    setStep("choose");
    setReceived("");
    if (ready) setDismissed(ready);
  };

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="key" value={key} />
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
                  {money(tt.priceCents)}
                  {tt.soldAtTill > 0 ? ` · ${t("soldAtTill", { count: tt.soldAtTill })}` : ""}
                </p>
                {failed ? <p className="text-sm text-destructive">{t(`errors.${state.error}`)}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => change(tt.id, -1)}
                disabled={qty === 0 || locked}
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
                onClick={() => change(tt.id, 1)}
                disabled={qty >= MAX_PER_LINE || locked}
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

      <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-border bg-background/95 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 backdrop-blur">
        {ready ? (
          <>
            <a
              href={ready.url}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-control bg-primary text-base font-medium text-primary-foreground shadow-sm"
            >
              <ExternalLink className="size-5" />
              {t("openCollect", { amount: money(total) })}
            </a>
            <div className="flex items-center justify-between text-sm">
              <button type="button" onClick={back} className="text-muted-foreground underline">
                {t("editSale")}
              </button>
              <a href={ready.webUrl} className="text-muted-foreground underline">
                {t("collectFallback")}
              </a>
            </div>
            <p className="text-center text-xs text-muted-foreground">{t("collectHint")}</p>
          </>
        ) : step === "twint" ? (
          <div className="space-y-3 rounded-card border border-border bg-card p-4 text-center">
            <p className="text-sm text-muted-foreground">{t("twintAsk")}</p>
            <p className="text-3xl font-bold tabular-nums">{money(total)}</p>
            {twintNumber ? (
              <p className="text-lg">
                {t("twintTo")} <span className="font-semibold tabular-nums">{twintNumber}</span>
              </p>
            ) : (
              <p className="text-sm text-[var(--warning)]">{t("twintNoNumber")}</p>
            )}
            <Button
              type="submit"
              name="method"
              value="twint"
              size="lg"
              className="h-14 w-full text-base"
              disabled={pending || done}
            >
              {pending || done ? <Loader2 className="size-5 animate-spin" /> : <Smartphone className="size-5" />}
              {t("twintPaid")}
            </Button>
            <button
              type="button"
              onClick={back}
              disabled={pending || done}
              className="text-sm text-muted-foreground underline"
            >
              {t("backToMethods")}
            </button>
          </div>
        ) : step === "cash" ? (
          <div className="space-y-3 rounded-card border border-border bg-card p-4 text-center">
            <p className="text-sm text-muted-foreground">{t("cashAsk")}</p>
            <p className="text-3xl font-bold tabular-nums">{money(total)}</p>
            <label className="flex items-center justify-center gap-2 text-sm">
              {t("cashReceived")}
              <input
                inputMode="decimal"
                value={received}
                onChange={(e) => setReceived(e.target.value)}
                placeholder={(total / 100).toFixed(2)}
                className="h-11 w-28 rounded-control border border-border bg-background px-3 text-right text-base tabular-nums"
              />
            </label>
            {received && changeDue != null ? (
              <p className="text-lg">
                {t("cashChange")} <span className="font-semibold tabular-nums">{money(changeDue)}</span>
              </p>
            ) : null}
            <Button
              type="submit"
              name="method"
              value="cash"
              size="lg"
              className="h-14 w-full text-base"
              disabled={pending || done}
            >
              {pending || done ? <Loader2 className="size-5 animate-spin" /> : <Banknote className="size-5" />}
              {t("cashPaid")}
            </Button>
            <button
              type="button"
              onClick={back}
              disabled={pending || done}
              className="text-sm text-muted-foreground underline"
            >
              {t("backToMethods")}
            </button>
          </div>
        ) : count === 0 ? (
          <Button type="button" size="lg" className="h-14 w-full text-base" disabled>
            {t("chooseTariff")}
          </Button>
        ) : total === 0 ? (
          <Button
            type="submit"
            name="method"
            value="cash"
            size="lg"
            className="h-14 w-full text-base"
            disabled={pending || done}
          >
            {pending || done ? <Loader2 className="size-5 animate-spin" /> : null}
            {t("recordFree", { count })}
          </Button>
        ) : (
          <>
            <p className="text-center text-sm">{t("totalToPay", { count, amount: money(total) })}</p>
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="submit"
                name="method"
                value="card"
                size="lg"
                className="h-16 flex-col gap-1"
                disabled={pending}
              >
                {pending ? <Loader2 className="size-5 animate-spin" /> : <CreditCard className="size-5" />}
                {t("methodCard")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-16 flex-col gap-1"
                disabled={pending}
                onClick={() => setStep("twint")}
              >
                <Smartphone className="size-5" />
                {t("methodTwint")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-16 flex-col gap-1"
                disabled={pending}
                onClick={() => setStep("cash")}
              >
                <Banknote className="size-5" />
                {t("methodCash")}
              </Button>
            </div>
          </>
        )}
      </div>
    </form>
  );
}
