import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, Store } from "lucide-react";
import { CancelSale } from "@/components/door/cancel-sale";
import { Link } from "@/i18n/navigation";
import { canManageTill } from "@/lib/door/scope";
import { statsActor } from "@/lib/admin/access";
import { prisma } from "@/lib/prisma";
import { getTillReport, getTillSessions } from "@/lib/reports/till";
import { bucketOf, TILL_BUCKETS, type TillBucket } from "@/lib/reports/till-summary";
import { cn, EVENT_TIME_ZONE, formatPrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

const BUCKET: Record<TillBucket, { method: "card" | "twint" | "cash"; mode?: "online" | "offline" }> = {
  cardOnline: { method: "card", mode: "online" },
  cardOffline: { method: "card", mode: "offline" },
  twintOnline: { method: "twint", mode: "online" },
  twintOffline: { method: "twint", mode: "offline" },
  cash: { method: "cash" },
};

/**
 * Rapport de la caisse sur place : pour un concert, ce qui a été vendu, par
 * moyen de paiement (en ligne / hors ligne), par tarif et par vendeur, puis
 * chaque vente.
 */
export default async function TillReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ organizer?: string; s?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { organizerId: own, user } = await statsActor();
  const canCancel = canManageTill(user);
  const t = await getTranslations("admin.tillReport");
  const tc = await getTranslations("door.sell.cancel");
  const intl = `${locale}-CH`;
  const money = (cents: number) => formatPrice(cents, intl);
  const query = await searchParams;

  const organizers = own
    ? []
    : await prisma.organizer.findMany({
        where: { events: { some: { sessions: { some: { doorSales: { some: {} } } } } } },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
  const organizerId = own ?? organizers.find((o) => o.id === query.organizer)?.id ?? organizers[0]?.id ?? null;
  const sessions = organizerId ? await getTillSessions(organizerId, locale) : [];
  const selected = sessions.find((s) => s.id === query.s) ?? sessions[0] ?? null;
  const report = organizerId && selected ? await getTillReport(organizerId, selected.id) : null;
  const orgQuery = own ? {} : { organizer: organizerId ?? undefined };

  const when = (date: Date, withDay = true) =>
    new Intl.DateTimeFormat(intl, {
      timeZone: EVENT_TIME_ZONE,
      ...(withDay ? { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" } : {}),
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  const label = (bucket: TillBucket | null) => {
    if (!bucket) return t("free");
    const { method, mode } = BUCKET[bucket];
    return mode ? `${t(method)} · ${t(mode)}` : t(method);
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={{ pathname: "/admin/reports", query: own ? {} : { organizer: organizerId ?? undefined } }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("back")}
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-2xl">
          <Store className="size-6 text-primary" />
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {organizers.length > 1 ? (
        <nav className="flex flex-wrap gap-2">
          {organizers.map((o) => (
            <Link
              key={o.id}
              href={{ pathname: "/admin/reports/till", query: { organizer: o.id } }}
              className={cn(
                "rounded-full border border-border px-3 py-1 text-sm",
                o.id === organizerId && "border-primary bg-primary/5 font-medium",
              )}
            >
              {o.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {sessions.length === 0 ? (
        <p className="rounded-card border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <nav aria-label={t("concerts")} className="space-y-1">
            {sessions.map((s) => (
              <Link
                key={s.id}
                href={{ pathname: "/admin/reports/till", query: { ...orgQuery, s: s.id } }}
                className={cn(
                  "block rounded-control border border-transparent px-3 py-2 text-sm hover:bg-muted/50",
                  s.id === selected?.id && "border-border bg-card",
                )}
              >
                <span className="block text-xs tabular-nums text-muted-foreground">{when(s.startsAt)}</span>
                <span className="block font-medium">{s.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {t("salesCount", { count: s.sales })} · {money(s.cents)}
                </span>
              </Link>
            ))}
          </nav>

          {selected && report ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold">{selected.title}</h2>
                <p className="text-sm text-muted-foreground">{when(selected.startsAt)}</p>
              </div>

              <dl className="grid gap-3 sm:grid-cols-3">
                {[
                  [t("collected"), money(report.summary.cents)],
                  [t("tickets"), `${report.summary.tickets}${report.summary.freeTickets ? ` (${t("ofWhichFree", { count: report.summary.freeTickets })})` : ""}`],
                  [t("sales"), String(report.summary.sales)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-card border border-border bg-card p-4">
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
                    <dd className="mt-1 text-2xl font-semibold tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>

              <section>
                <h3 className="mb-2 font-semibold">{t("byMethod")}</h3>
                <table className="w-full rounded-card border border-border text-sm">
                  <tbody className="divide-y divide-border">
                    {TILL_BUCKETS.map((b) => (
                      <tr key={b} className={report.summary.parts[b].sales === 0 ? "text-muted-foreground" : undefined}>
                        <td className="px-4 py-2">{label(b)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{t("salesCount", { count: report.summary.parts[b].sales })}</td>
                        <td className="px-4 py-2 text-right font-medium tabular-nums">{money(report.summary.parts[b].cents)}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="px-4 py-2">{t("total")}</td>
                      <td />
                      <td className="px-4 py-2 text-right tabular-nums">{money(report.summary.cents)}</td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section>
                <h3 className="mb-2 font-semibold">{t("byTariff")}</h3>
                <table className="w-full rounded-card border border-border text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-semibold">{t("tariff")}</th>
                      <th className="px-4 py-2 text-right font-semibold">{t("price")}</th>
                      <th className="px-4 py-2 text-right font-semibold">{t("quantity")}</th>
                      <th className="px-4 py-2 text-right font-semibold">{t("amount")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.summary.tariffs.map((row) => (
                      <tr key={`${row.name}-${row.unitPriceCents}`}>
                        <td className="px-4 py-2">{row.name}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{money(row.unitPriceCents)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{row.quantity}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{money(row.cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section>
                <h3 className="mb-2 font-semibold">{t("bySeller")}</h3>
                <div className="overflow-x-auto rounded-card border border-border">
                  <table className="w-full min-w-[34rem] text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 font-semibold">{t("seller")}</th>
                        <th className="px-4 py-2 text-right font-semibold">{t("tickets")}</th>
                        <th className="px-4 py-2 text-right font-semibold">{t("cash")}</th>
                        <th className="px-4 py-2 text-right font-semibold">{t("card")}</th>
                        <th className="px-4 py-2 text-right font-semibold">{t("twint")}</th>
                        <th className="px-4 py-2 text-right font-semibold">{t("total")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {report.summary.sellers.map((s) => (
                        <tr key={s.id ?? "none"}>
                          <td className="px-4 py-2 font-medium">{s.name}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{s.tickets}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{money(s.parts.cash.cents)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {money(s.parts.cardOnline.cents + s.parts.cardOffline.cents)}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {money(s.parts.twintOnline.cents + s.parts.twintOffline.cents)}
                          </td>
                          <td className="px-4 py-2 text-right font-semibold tabular-nums">{money(s.cents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t("cashHint")}</p>
              </section>

              <section>
                <h3 className="mb-2 font-semibold">{t("detail")}</h3>
                <div className="overflow-x-auto rounded-card border border-border">
                  <table className="w-full min-w-[34rem] text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 font-semibold">{t("time")}</th>
                        <th className="px-4 py-2 font-semibold">{t("seller")}</th>
                        <th className="px-4 py-2 font-semibold">{t("method")}</th>
                        <th className="px-4 py-2 font-semibold">{t("tickets")}</th>
                        <th className="px-4 py-2 text-right font-semibold">{t("amount")}</th>
                        {canCancel ? <th className="px-4 py-2" /> : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {report.sales.map((sale) => (
                        <tr key={sale.id} className={sale.cancelledAt ? "bg-muted/40 text-muted-foreground" : undefined}>
                          <td className="px-4 py-2 tabular-nums">{when(sale.at, false)}</td>
                          <td className="px-4 py-2">{sale.seller}</td>
                          <td className="px-4 py-2">{label(bucketOf(sale.provider))}</td>
                          <td className="px-4 py-2">
                            <span className={sale.cancelledAt ? "line-through" : undefined}>
                              {sale.lines.map((l) => `${l.quantity}× ${l.name}`).join(", ")}
                            </span>
                            {sale.cancelledAt ? (
                              <span className="block text-xs text-destructive">
                                {tc("cancelledBy", { date: when(sale.cancelledAt), who: sale.cancelledBy ?? "—" })}
                                {sale.cancelReason ? ` · ${sale.cancelReason}` : ""}
                              </span>
                            ) : null}
                          </td>
                          <td className={`px-4 py-2 text-right tabular-nums ${sale.cancelledAt ? "line-through" : ""}`}>
                            {money(sale.amountCents)}
                          </td>
                          {canCancel ? (
                            <td className="px-4 py-2 text-right">
                              {sale.cancelledAt ? null : <CancelSale saleId={sale.id} provider={sale.provider} compact />}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
