import { getTranslations } from "next-intl/server";
import { Banknote, Coins, Scale, Ticket } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { describeRule, type CommissionRule } from "@/lib/resellers/commission";
import type { PosEventStats, PosStats } from "@/lib/resellers/stats";
import { t as translate, type Translated } from "@/lib/types";
import { formatDate, formatPrice } from "@/lib/utils";

/** Montant, pourcentage ou forfait par billet, tel qu'affiché partout. */
export async function ruleLabel(rule: CommissionRule, locale: string): Promise<string> {
  const t = await getTranslations("pos.stats");
  return describeRule(
    rule,
    `${locale}-CH`,
    (cents) => formatPrice(cents, `${locale}-CH`),
    (amount) => t("perTicket", { amount }),
  );
}

export async function PosTotalsCards({ stats, locale }: { stats: PosStats; locale: string }) {
  const t = await getTranslations("pos.stats");
  const money = (cents: number) => formatPrice(cents, `${locale}-CH`);
  const { totals } = stats;
  const cards = [
    {
      icon: Ticket,
      label: t("tickets"),
      value: String(totals.tickets),
      hint: totals.pendingTickets > 0 ? t("pending", { count: totals.pendingTickets }) : t("ticketsHint"),
    },
    {
      icon: Banknote,
      label: t("amount"),
      value: money(totals.amountCents),
      hint: t("byMethod", {
        cash: money(totals.cashCents),
        terminal: money(totals.terminalCents),
        online: money(totals.onlineCents),
      }),
    },
    {
      icon: Coins,
      label: t("commission"),
      value: money(totals.commissionCents),
      hint: t("commissionHint"),
    },
    {
      icon: Scale,
      label: stats.balanceCents < 0 ? t("balanceOwed") : t("balanceDue"),
      value: money(Math.abs(stats.balanceCents)),
      hint: stats.balanceCents < 0 ? t("balanceHintOwed") : t("balanceHintDue"),
    },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(({ icon: Icon, label, value, hint }) => (
        <div key={label} className="rounded-card border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Icon className="size-4" />
            <span className="text-sm font-medium">{label}</span>
          </div>
          <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
      ))}
    </div>
  );
}

/** Ce que chacun doit à l'autre, espèces et carte séparées. */
export async function PosSettlement({ stats, locale }: { stats: PosStats; locale: string }) {
  const t = await getTranslations("pos.stats.settlement");
  const money = (cents: number) => formatPrice(cents, `${locale}-CH`);
  const { totals } = stats;
  const onSiteCents = totals.cashCents + totals.terminalCents;
  const rows = [
    {
      label: totals.terminalCents > 0 ? t("cashTerminal") : t("cash"),
      sales: onSiteCents,
      commission: totals.onSiteCommissionCents,
      result: t("owed", { amount: money(onSiteCents - totals.onSiteCommissionCents) }),
    },
    {
      label: t("card"),
      sales: totals.onlineCents,
      commission: totals.onlineCommissionCents,
      result: t("due", { amount: money(totals.onlineCommissionCents) }),
    },
  ];
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>
      </div>
      <div className="overflow-x-auto rounded-card border border-border">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">{t("method")}</th>
              <th className="px-4 py-3 text-right font-medium">{t("sales")}</th>
              <th className="px-4 py-3 text-right font-medium">{t("commission")}</th>
              <th className="px-4 py-3 text-right font-medium">{t("result")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.label}>
                <td className="px-4 py-3 font-medium">{row.label}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(row.sales)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(row.commission)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{row.result}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-border bg-muted/30">
            <tr>
              <td className="px-4 py-3 font-semibold" colSpan={3}>
                {stats.balanceCents < 0 ? t("netOwed") : t("netDue")}
              </td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">
                {money(Math.abs(stats.balanceCents))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

/** Ventes par spectacle attribué ; `sellable` ajoute un lien de vente (espace du point de vente). */
export async function PosEventsTable({
  events,
  locale,
  showOrganizer,
  sellable,
}: {
  events: PosEventStats[];
  locale: string;
  showOrganizer: boolean;
  sellable?: boolean;
}) {
  const t = await getTranslations("pos.stats");
  const money = (cents: number) => formatPrice(cents, `${locale}-CH`);
  if (events.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {t("noEvents")}
      </p>
    );
  }
  const rules = await Promise.all(events.map((e) => ruleLabel(e.rule, locale)));
  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <table className="w-full min-w-[44rem] text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">{t("show")}</th>
            <th className="px-4 py-3 font-medium">{t("rule")}</th>
            <th className="px-4 py-3 text-right font-medium">{t("tickets")}</th>
            <th className="px-4 py-3 text-right font-medium">{t("amount")}</th>
            <th className="px-4 py-3 text-right font-medium">{t("commission")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {events.map((e, i) => {
            const title = translate(e.title as Translated, locale);
            const when = e.nextStartsAt ?? e.lastStartsAt;
            return (
              <tr key={e.eventId}>
                <td className="px-4 py-3">
                  {sellable && e.nextStartsAt ? (
                    <Link href={`/pos/sell#${e.eventId}`} className="font-medium hover:text-primary hover:underline">
                      {title}
                    </Link>
                  ) : (
                    <span className="font-medium">{title}</span>
                  )}
                  <span className="block text-xs text-muted-foreground">
                    {[
                      showOrganizer ? e.organizerName : null,
                      when
                        ? e.nextStartsAt
                          ? t("next", { date: formatDate(when, `${locale}-CH`) })
                          : t("last", { date: formatDate(when, `${locale}-CH`) })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {rules[i]}
                  {e.overridden ? <span className="block text-xs">{t("ruleOverridden")}</span> : null}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {e.tickets}
                  {e.pendingTickets > 0 ? (
                    <span className="block text-xs text-muted-foreground">
                      {t("pending", { count: e.pendingTickets })}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{money(e.amountCents)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(e.commissionCents)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
