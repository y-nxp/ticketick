import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowUpRight, Info } from "lucide-react";
import { PostStatusBadge } from "@/components/admin/promotion/status-badge";
import { Link } from "@/i18n/navigation";
import { getPromotionCampaign } from "@/lib/data/promotion";
import { channelOf, displayLink } from "@/lib/promotion/channels";
import { ATTRIBUTION_WINDOW_DAYS } from "@/lib/promotion/cookie";
import { conversionRate } from "@/lib/promotion/results";
import { isPromotionSource } from "@/lib/promotion/source";
import { t as translate, type Translated } from "@/lib/types";
import { formatDate, formatPrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Résultats d'une campagne (docs/module-promotion.md, §§ 5.2 à 5.4) :
 * publications, clics, commandes, billets et montants, par source et par
 * jour. Tous les chiffres viennent de `results.ts`, comme la liste et le
 * rapport courriel.
 */
export default async function PromotionCampaignPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const [view, t] = await Promise.all([getPromotionCampaign(id), getTranslations("admin.promotion")]);
  const { campaign, detail } = view;
  const intl = `${locale}-CH`;
  const date = (d: Date) => formatDate(d, intl);
  const money = (cents: number) => formatPrice(cents, intl);
  const day = (key: string) =>
    new Intl.DateTimeFormat(intl, { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(
      new Date(`${key}T00:00:00Z`),
    );
  const source = (s: string) => (isPromotionSource(s) ? t(`results.source.${s}`) : s);
  const rate = conversionRate(detail);
  const link = `${view.origin.replace(/\/$/, "")}/p/${campaign.code}`;

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted-foreground">
          <Link href="/admin/promotion" className="hover:text-foreground">
            {t("accounts.back")}
          </Link>
        </p>
        <h1 className="mt-2 flex flex-wrap items-center gap-3 text-2xl font-bold tracking-tight">
          {campaign.name}
          {view.state ? <PostStatusBadge status={view.state} label={t(`status.${view.state}`)} /> : null}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <Link href={`/admin/events/${campaign.event.id}`} className="hover:text-foreground hover:underline">
            {translate(campaign.event.title as Translated, locale)}
          </Link>
          {view.showOrganizer ? ` · ${campaign.organizer.name}` : ""}
          {" · "}
          <span className="font-mono text-xs">{displayLink(link)}</span>
          {" · "}
          {t("campaigns.createdOn", { date: date(campaign.createdAt) })}
        </p>
      </header>

      <section className="space-y-3">
        <p className="text-lg">
          {t.rich("results.headline", {
            tickets: detail.event.tickets,
            amount: money(detail.event.cents),
            days: ATTRIBUTION_WINDOW_DAYS,
            strong: (chunks) => <strong className="font-semibold">{chunks}</strong>,
          })}
        </p>
        <details className="group max-w-3xl rounded-card border border-border bg-muted/30 px-4 py-3 text-sm">
          <summary className="flex cursor-pointer items-center gap-2 text-muted-foreground">
            <Info className="size-4" />
            {t("results.measure.title")}
          </summary>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
            <li>{t("results.measure.click")}</li>
            <li>{t("results.measure.device")}</li>
            <li>{t("results.measure.floor")}</li>
            <li>{t("results.measure.net")}</li>
            <li>{t("results.measure.fees")}</li>
          </ul>
        </details>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label={t("results.clicks")} value={String(detail.clicks)} />
        <Stat label={t("results.orders")} value={String(detail.orders)} />
        <Stat label={t("results.tickets")} value={String(detail.event.tickets)} hint={t("results.ticketsHint")} />
        <Stat label={t("results.revenue")} value={money(detail.event.cents)} hint={t("results.revenueHint")} />
        <Stat
          label={t("results.rate")}
          value={
            rate === null
              ? "–"
              : new Intl.NumberFormat(intl, { style: "percent", maximumFractionDigits: 1 }).format(rate)
          }
          hint={rate === null ? t("results.rateNone") : t("results.rateHint")}
        />
      </div>

      <section>
        <h2 className="font-semibold">{t("results.lines.title")}</h2>
        <div className="mt-3 overflow-x-auto rounded-card border border-border">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold" />
                <th className="px-4 py-3 text-right font-semibold">{t("results.tickets")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("results.revenue")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <td className="px-4 py-3 font-medium">{t("results.lines.event")}</td>
                <Num>{detail.event.tickets}</Num>
                <Num>{money(detail.event.cents)}</Num>
              </tr>
              <tr>
                <td className="px-4 py-3">
                  {t("results.lines.other")}
                  <p className="text-xs text-muted-foreground">{t("results.lines.otherHint")}</p>
                </td>
                <Num>{detail.other.tickets}</Num>
                <Num>{money(detail.other.cents)}</Num>
              </tr>
              <tr>
                <td className="px-4 py-3">{t("results.lines.options")}</td>
                <Num>–</Num>
                <Num>{money(detail.optionsCents)}</Num>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="font-semibold">{t("results.posts")}</h2>
        {campaign.posts.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("posts.empty")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-card border border-border text-sm">
            {campaign.posts.map((p) => {
              const channel = channelOf(p.account.provider);
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-medium">
                      {channel ? t(`channel.${channel}`) : p.account.provider}
                      <span className="font-normal text-muted-foreground"> · {p.account.name}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.publishedAt
                        ? t("posts.publishedAt", { date: date(p.publishedAt) })
                        : p.scheduledAt && p.status !== "CANCELLED"
                          ? t("posts.scheduledFor", { date: date(p.scheduledAt) })
                          : t("posts.notScheduled")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <PostStatusBadge status={p.status} label={t(`status.${p.status}`)} />
                    {p.permalink ? (
                      <a
                        href={p.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        {t("results.permalink")}
                        <ArrowUpRight className="size-3.5" />
                      </a>
                    ) : null}
                    <Link href={`/admin/promotion/publications/${p.id}`} className="text-primary hover:underline">
                      {t("posts.open")}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-semibold">{t("results.bySource")}</h2>
        <div className="mt-3 overflow-x-auto rounded-card border border-border">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">{t("results.sourceColumn")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("results.clicks")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("results.orders")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("results.allTickets")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("results.allRevenue")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {detail.bySource.map((row) => (
                <tr key={row.source}>
                  <td className="px-4 py-3">{source(row.source)}</td>
                  <Num>{row.clicks}</Num>
                  <Num>{row.orders}</Num>
                  <Num>{row.tickets}</Num>
                  <Num>{row.cents > 0 ? money(row.cents) : "–"}</Num>
                </tr>
              ))}
            </tbody>
          </table>
          {detail.bySource.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("results.noActivity")}</p>
          ) : null}
        </div>
      </section>

      <section>
        <h2 className="font-semibold">{t("results.byDay")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {view.firstPublishedAt
            ? t("results.byDaySince", { date: date(view.firstPublishedAt) })
            : t("results.byDayHint")}
        </p>
        <div className="mt-3 overflow-x-auto rounded-card border border-border">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">{t("results.day")}</th>
                {detail.sources.map((s) => (
                  <th key={s} className="px-4 py-3 text-right font-semibold">
                    {t("results.clicksFrom", { source: source(s) })}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-semibold">{t("results.orders")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("results.allTickets")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("results.allRevenue")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {detail.days.map((row) => (
                <tr key={row.day}>
                  <td className="whitespace-nowrap px-4 py-3">{day(row.day)}</td>
                  {detail.sources.map((s) => (
                    <Num key={s}>{row.clicksBySource[s] ?? 0}</Num>
                  ))}
                  <Num>{row.orders}</Num>
                  <Num>{row.tickets}</Num>
                  <Num>{row.cents > 0 ? money(row.cents) : "–"}</Num>
                </tr>
              ))}
            </tbody>
          </table>
          {detail.days.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("results.noActivity")}</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Num({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 text-right tabular-nums">{children}</td>;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-card border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
