import { getTranslations, setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { requireResellerAgent } from "@/lib/auth/dal";
import { getPosSales } from "@/lib/resellers/data";
import { t as translate, type Translated } from "@/lib/types";
import { formatDate, formatPrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PosSalesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const agent = await requireResellerAgent("/pos/sales");
  const t = await getTranslations("pos.sales");
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const { sales, pages } = await getPosSales(agent, page);
  const money = (cents: number) => formatPrice(cents, `${locale}-CH`);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>
      {sales.length === 0 ? (
        <p className="rounded-card border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("none")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t("sale")}</th>
                <th className="px-4 py-3 font-medium">{t("show")}</th>
                <th className="px-4 py-3 font-medium">{t("method")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("tickets")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("amount")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("commission")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sales.map((sale) => (
                <tr key={sale.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link
                      href={`/pos/sales/${sale.id}`}
                      className="font-mono text-xs font-medium hover:text-primary hover:underline"
                    >
                      {sale.reference}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {[formatDate(sale.createdAt, `${locale}-CH`), sale.holder, sale.seller]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {sale.eventTitle ? translate(sale.eventTitle as Translated, locale) : null}
                    {sale.startsAt ? (
                      <span className="block text-xs text-muted-foreground">
                        {formatDate(sale.startsAt, `${locale}-CH`)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span className="block">{t(`methods.${sale.method}`)}</span>
                    {sale.state !== "paid" ? (
                      <Badge variant={sale.state === "pending" ? "default" : "outline"} className="mt-1">
                        {t(`states.${sale.state}`)}
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{sale.tickets}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(sale.amountCents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(sale.commissionCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 ? (
        <nav className="flex items-center justify-center gap-4 text-sm">
          {page > 1 ? (
            <Link href={`/pos/sales?page=${page - 1}`} className="hover:text-primary">
              {t("previous")}
            </Link>
          ) : null}
          <span className="text-muted-foreground">{t("page", { page, pages })}</span>
          {page < pages ? (
            <Link href={`/pos/sales?page=${page + 1}`} className="hover:text-primary">
              {t("following")}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
