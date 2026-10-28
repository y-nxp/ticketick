import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getPromotionAccounts } from "@/lib/data/promotion";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Comptes Facebook / Instagram (docs/module-promotion.md, § 2.3). La
 * connexion OAuth fera l'objet d'une carte ultérieure, après la décision
 * d'app Meta : en attendant, la page dit ce qui arrive, sans bouton factice.
 */
export default async function PromotionAccountsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [accounts, t] = await Promise.all([
    getPromotionAccounts(),
    getTranslations("admin.promotion.accounts"),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">
          <Link href="/admin/promotion" className="hover:text-foreground">
            {t("back")}
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{t("pageTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("pageSubtitle")}</p>
      </header>

      <section className="rounded-card border border-border bg-card p-6">
        {accounts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Link2 className="size-6 text-muted-foreground" />
            <p className="font-medium">{t("empty")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span>
                  <span className="font-medium">{a.name}</span>
                  {a.username ? <span className="text-muted-foreground"> @{a.username}</span> : null}
                  <span className="block text-xs text-muted-foreground">
                    {t(`provider.${a.provider}`)} · {a.organizer.name} ·{" "}
                    {t("connectedAt", { date: formatDate(a.connectedAt, `${locale}-CH`) })}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">{t(`status.${a.status}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-card border border-dashed border-border p-6">
        <h2 className="font-semibold">{t("comingTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("comingBody")}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t("comingInstagram")}</p>
      </section>
    </div>
  );
}
