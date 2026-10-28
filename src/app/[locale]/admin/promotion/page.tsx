import { getTranslations, setRequestLocale } from "next-intl/server";
import { Megaphone } from "lucide-react";
import { PostStatusBadge } from "@/components/admin/promotion/status-badge";
import { Link } from "@/i18n/navigation";
import { getPromotionOverview } from "@/lib/data/promotion";
import { channelOf } from "@/lib/promotion/channels";
import { t as translate, type Translated } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Écran `/admin/promotion` (docs/module-promotion.md, § 2.2) : comptes
 * connectés, publications et leur état, campagnes. Lecture par
 * `statsActor()` : le responsable invité voit, sans agir.
 */
export default async function PromotionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [data, t] = await Promise.all([getPromotionOverview(), getTranslations("admin.promotion")]);
  const date = (d: Date) => formatDate(d, `${locale}-CH`);
  const title = (value: unknown) => translate(value as Translated, locale);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <section className="rounded-card border border-border bg-card p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">{t("accounts.title")}</h2>
          <Link href="/admin/promotion/comptes" className="text-sm text-primary hover:underline">
            {t("accounts.manage")}
          </Link>
        </div>
        {data.accounts.length === 0 ? (
          <div className="mt-3 text-sm">
            <p className="font-medium">{t("accounts.empty")}</p>
            <p className="mt-1 text-muted-foreground">{t("accounts.emptyHint")}</p>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-border text-sm">
            {data.accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{a.name}</span>{" "}
                  <span className="text-muted-foreground">
                    · {t(`accounts.provider.${a.provider}`)}
                    {data.showOrganizer ? ` · ${a.organizer.name}` : ""}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">{t(`accounts.status.${a.status}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-semibold">{t("posts.title")}</h2>
        <div className="mt-3 overflow-x-auto rounded-card border border-border">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">{t("posts.event")}</th>
                <th className="px-4 py-3 font-semibold">{t("posts.channel")}</th>
                <th className="px-4 py-3 font-semibold">{t("posts.status")}</th>
                <th className="px-4 py-3 font-semibold">{t("posts.when")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.posts.map((p) => {
                const channel = channelOf(p.account.provider);
                return (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium">{title(p.campaign.event.title)}</p>
                      <p className="text-xs text-muted-foreground">{p.campaign.name}</p>
                    </td>
                    <td className="px-4 py-3">
                      {channel ? t(`channel.${channel}`) : p.account.provider}
                      <p className="text-xs text-muted-foreground">{p.account.name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <PostStatusBadge status={p.status} label={t(`status.${p.status}`)} />
                      {p.status === "FAILED" && p.lastError ? (
                        <p className="mt-1 text-xs text-destructive">{p.lastError}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.publishedAt
                        ? t("posts.publishedAt", { date: date(p.publishedAt) })
                        : p.scheduledAt && p.status !== "CANCELLED"
                          ? t("posts.scheduledFor", { date: date(p.scheduledAt) })
                          : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/promotion/publications/${p.id}`}
                        className="text-primary hover:underline"
                      >
                        {p.editable ? t("posts.edit") : t("posts.open")}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {data.posts.length === 0 ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Megaphone className="size-4" />
              {t("posts.empty")}
            </p>
          ) : null}
        </div>
      </section>

      <section>
        <h2 className="font-semibold">{t("campaigns.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("campaigns.resultsSoon")}</p>
        <div className="mt-3 overflow-x-auto rounded-card border border-border">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">{t("campaigns.name")}</th>
                <th className="px-4 py-3 font-semibold">{t("campaigns.link")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("campaigns.posts")}</th>
                <th className="px-4 py-3 font-semibold">{t("campaigns.created")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.campaigns.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {title(c.event.title)}
                      {data.showOrganizer ? ` · ${c.organizer.name}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {`${data.origin.replace(/^https?:\/\//, "")}/p/${c.code}`}
                    <span className="ml-2 font-sans uppercase text-muted-foreground">{c.locale}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{c._count.posts}</td>
                  <td className="px-4 py-3 text-muted-foreground">{date(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.campaigns.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("campaigns.empty")}</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
