import { getTranslations } from "next-intl/server";
import { CheckCircle2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getDoorSaleSummary } from "@/lib/door/sale";
import { EVENT_TIME_ZONE, formatPrice } from "@/lib/utils";

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
  const totalSold = session.tariffs.reduce((n, tt) => n + tt.soldAtTill, 0);

  return (
    <div className="space-y-5">
      <div className="rounded-card border border-emerald-600/30 bg-emerald-50 p-5 text-center dark:bg-emerald-950/30">
        <CheckCircle2 className="mx-auto size-10 text-emerald-600" />
        <p className="mt-2 text-lg font-semibold">{again ? t("alreadyRecorded") : t("recorded")}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {sale.amountCents > 0 ? formatPrice(sale.amountCents, intl) : t("free")}
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
      <div className="rounded-card border border-border bg-card px-4 py-3 text-sm">
        <p className="font-medium">
          {t("tillTotal", {
            title: session.title,
            when: new Intl.DateTimeFormat(intl, {
              timeZone: EVENT_TIME_ZONE,
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            }).format(session.startsAt),
            count: totalSold,
          })}
        </p>
        <p className="mt-1 text-muted-foreground">
          {session.tariffs
            .filter((tt) => tt.soldAtTill > 0)
            .map((tt) => `${tt.name} ${tt.soldAtTill}`)
            .join(" · ")}
        </p>
      </div>
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
