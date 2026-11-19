import { getTranslations } from "next-intl/server";
import type { TillTotals } from "@/lib/door/sale";
import { formatPrice } from "@/lib/utils";

/** Caisse d'un concert : billets vendus et montants par moyen de paiement. */
export async function TillTotalsCard({ totals, locale }: { totals: TillTotals; locale: string }) {
  const t = await getTranslations("door.sell");
  const money = (cents: number) => formatPrice(cents, `${locale}-CH`);
  const all = totals.card.cents + totals.twint.cents + totals.cash.cents;
  const row = (label: string, part: { sales: number; cents: number }) => (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">
        {label} <span className="text-xs">({t("salesCount", { count: part.sales })})</span>
      </dt>
      <dd className="tabular-nums">{money(part.cents)}</dd>
    </div>
  );
  return (
    <section className="rounded-card border border-border bg-card px-4 py-3 text-sm">
      <h3 className="font-medium">{t("totalsTitle", { count: totals.tickets })}</h3>
      <dl className="mt-2 space-y-1">
        {row(t("methodCard"), totals.card)}
        {row(t("methodTwint"), totals.twint)}
        {row(t("methodCash"), totals.cash)}
        <div className="flex justify-between border-t border-border pt-1 font-semibold">
          <dt>{t("totalsAll")}</dt>
          <dd className="tabular-nums">{money(all)}</dd>
        </div>
      </dl>
    </section>
  );
}
