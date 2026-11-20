import { getTranslations } from "next-intl/server";
import { TILL_BUCKETS, type TillBucket, type TillTotals } from "@/lib/door/sale";
import { formatPrice } from "@/lib/utils";

/** Libellé d'une ligne des totaux : moyen, puis « en ligne » ou « hors ligne » en petit. */
export const BUCKET_LABEL: Record<TillBucket, { method: "methodCard" | "methodTwint" | "methodCash"; mode?: "online" | "offline" }> = {
  cardOnline: { method: "methodCard", mode: "online" },
  cardOffline: { method: "methodCard", mode: "offline" },
  twintOnline: { method: "methodTwint", mode: "online" },
  twintOffline: { method: "methodTwint", mode: "offline" },
  cash: { method: "methodCash" },
};

/** Caisse d'un concert : billets vendus, montants par moyen, espèces du vendeur. */
export async function TillTotalsCard({ totals, locale }: { totals: TillTotals; locale: string }) {
  const t = await getTranslations("door.sell");
  const money = (cents: number) => formatPrice(cents, `${locale}-CH`);
  const all = TILL_BUCKETS.reduce((sum, b) => sum + totals.parts[b].cents, 0);
  // Les espèces restent affichées (caisse à contrôler) ; les autres lignes
  // seulement quand il y a eu des ventes.
  const shown = TILL_BUCKETS.filter((b) => b === "cash" || totals.parts[b].sales > 0);
  return (
    <section className="rounded-card border border-border bg-card px-4 py-3 text-sm">
      <h3 className="font-medium">{t("totalsTitle", { count: totals.tickets })}</h3>
      <dl className="mt-2 space-y-1">
        {shown.map((bucket) => {
          const { method, mode } = BUCKET_LABEL[bucket];
          const part = totals.parts[bucket];
          return (
            <div key={bucket} className="flex justify-between gap-2">
              <dt className="text-muted-foreground">
                {t(method)}
                {mode ? <span className="ml-1 text-xs">· {t(mode)}</span> : null}{" "}
                <span className="text-xs">({t("salesCount", { count: part.sales })})</span>
              </dt>
              <dd className="tabular-nums">{money(part.cents)}</dd>
            </div>
          );
        })}
        <div className="flex justify-between border-t border-border pt-1 font-semibold">
          <dt>{t("totalsAll")}</dt>
          <dd className="tabular-nums">{money(all)}</dd>
        </div>
      </dl>
      {totals.myCash ? (
        <p className="mt-2 rounded-control bg-muted/60 px-3 py-2">
          {t("myCash", { amount: money(totals.myCash.cents), count: totals.myCash.sales })}
        </p>
      ) : null}
    </section>
  );
}
