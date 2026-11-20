import { getTranslations } from "next-intl/server";
import { CheckCircle2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { formatPrice } from "@/lib/utils";
import { bucketOf, getDoorSaleSummary } from "@/lib/door/sale";
import { BUCKET_LABEL, TillTotalsCard } from "./till-totals";

/** Vente comptée : billets papier à remettre, et ce que la caisse a vendu pour ce concert. */
export async function SaleSummary({
  saleId,
  locale,
  again,
}: {
  saleId: string;
  locale: string;
  again?: boolean;
}) {
  const t = await getTranslations("door.sell");
  const summary = await getDoorSaleSummary(saleId, locale);
  if (!summary) return null;
  const { sale, session } = summary;
  const intl = `${locale}-CH`;
  const methodLabel = (provider: string) => {
    const bucket = bucketOf(provider);
    if (!bucket) return t("methodCard");
    const { method, mode } = BUCKET_LABEL[bucket];
    return mode ? `${t(method)} (${t(mode)})` : t(method);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-card border border-emerald-600/30 bg-emerald-50 p-5 text-center dark:bg-emerald-950/30">
        <CheckCircle2 className="mx-auto size-10 text-emerald-600" />
        <p className="mt-2 text-lg font-semibold">{again ? t("alreadyRecorded") : t("recorded")}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {sale.amountCents > 0
            ? `${formatPrice(sale.amountCents, intl)} · ${methodLabel(sale.provider)}`
            : t("free")}
        </p>
        <p className="mt-2 text-sm font-medium">{t("handPaper")}</p>
      </div>
      <ul className="divide-y divide-border rounded-card border border-border bg-card">
        {sale.lines.map((line) => (
          <li key={line.ticketTypeId} className="flex justify-between px-4 py-3">
            <span className="font-medium">
              {line.quantity}× {line.name}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {formatPrice(line.unitPriceCents * line.quantity, intl)}
            </span>
          </li>
        ))}
      </ul>
      <TillTotalsCard totals={session.totals} locale={locale} />
      <div className="grid gap-2">
        <Link
          href={{ pathname: "/door/sell", query: { s: session.id } }}
          className="flex h-14 items-center justify-center rounded-control bg-primary text-base font-medium text-primary-foreground"
        >
          {t("nextSale")}
        </Link>
        <Link href="/door/sell" className="flex h-11 items-center justify-center rounded-control border border-border text-sm">
          {t("otherConcert")}
        </Link>
      </div>
    </div>
  );
}
