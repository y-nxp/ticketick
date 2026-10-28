import { getTranslations } from "next-intl/server";
import { Megaphone } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getEventPromotion } from "@/lib/data/promotion";
import { channelOf } from "@/lib/promotion/channels";
import { formatDate } from "@/lib/utils";
import { PostStatusBadge } from "./status-badge";

/**
 * Section « Promouvoir » de la fiche événement, juste après `ShareEmbed`
 * (docs/module-promotion.md, § 2.2) : état de promouvabilité, comptes
 * connectés, bouton vers le compositeur et dernières publications.
 */
export async function PromoteSection({ eventId, locale }: { eventId: string; locale: string }) {
  const [data, t] = await Promise.all([getEventPromotion(eventId), getTranslations("admin.promotion")]);
  if (!data) return null;
  const { promotability: rules } = data;
  const reasons = rules.blockers.map((b) => t(`blockers.${b}`)).join(", ");
  const buttonClass =
    "inline-flex h-10 items-center gap-2 rounded-control bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary-hover";

  return (
    <section className="rounded-card border border-border bg-card p-6">
      <h2 className="font-semibold">{t("section.title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("section.hint")}</p>

      <div className="mt-4 space-y-3 text-sm">
        {!rules.promotable ? (
          <p className="text-muted-foreground">
            {t("section.notPromotable", { reasons })}{" "}
            {rules.preparable ? t("section.draftOnly") : null}
          </p>
        ) : null}
        {!rules.attribution ? <p className="text-muted-foreground">{t("section.noAttribution")}</p> : null}
        {data.activeAccounts === 0 ? (
          <p>
            <span className="font-medium">{t("section.noAccount")}</span>{" "}
            <Link href="/admin/promotion/comptes" className="text-primary hover:underline">
              {t("section.connect")}
            </Link>
          </p>
        ) : null}

        {rules.preparable ? (
          <Link href={`/admin/promotion/nouveau?event=${eventId}`} className={buttonClass}>
            <Megaphone className="size-4" />
            {t("section.promote")}
          </Link>
        ) : (
          <span aria-disabled className={`${buttonClass} pointer-events-none opacity-50`}>
            <Megaphone className="size-4" />
            {t("section.promote")}
          </span>
        )}
      </div>

      {data.posts.length ? (
        <div className="mt-5">
          <p className="text-sm font-medium">{t("section.recent")}</p>
          <ul className="mt-2 divide-y divide-border text-sm">
            {data.posts.map((p) => {
              const channel = channelOf(p.account.provider);
              const when = p.publishedAt ?? (p.status !== "CANCELLED" ? p.scheduledAt : null);
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/admin/promotion/publications/${p.id}`} className="hover:text-primary hover:underline">
                    {channel ? t(`channel.${channel}`) : p.account.provider} · {p.account.name}
                  </Link>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {when ? formatDate(when, `${locale}-CH`) : null}
                    <PostStatusBadge status={p.status} label={t(`status.${p.status}`)} />
                  </span>
                </li>
              );
            })}
          </ul>
          <Link href="/admin/promotion" className="mt-2 inline-block text-sm text-primary hover:underline">
            {t("section.all")}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
