import { getTranslations, setRequestLocale } from "next-intl/server";
import { PostStatusBadge } from "@/components/admin/promotion/status-badge";
import { Link } from "@/i18n/navigation";
import { getPromotionPost } from "@/lib/data/promotion";
import { t as translate, type Translated } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { PostEditor } from "./post-editor";

export const dynamic = "force-dynamic";

/**
 * Une publication : modifiable et annulable tant que la minuterie ne l'a pas
 * prise en charge (docs/module-promotion.md, § 2.5), en lecture sinon.
 */
export default async function PromotionPostPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const [post, t] = await Promise.all([getPromotionPost(id), getTranslations("admin.promotion")]);
  const date = (d: Date) => formatDate(d, `${locale}-CH`);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">
          <Link href="/admin/promotion" className="hover:text-foreground">
            {t("accounts.back")}
          </Link>
        </p>
        <h1 className="mt-2 flex flex-wrap items-center gap-3 text-2xl font-bold tracking-tight">
          {t("post.title", { channel: t(`channel.${post.channel}`) })}
          <PostStatusBadge status={post.status} label={t(`status.${post.status}`)} />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {translate(post.campaign.event.title as Translated, locale)} · {post.campaign.name}
        </p>
      </header>

      <dl className="grid gap-4 rounded-card border border-border bg-card p-6 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">{t("post.account")}</dt>
          <dd className="font-medium">
            {post.account.name}
            {post.account.username ? ` (@${post.account.username})` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("post.link")}</dt>
          <dd className="break-all font-mono text-xs">{post.linkUrl}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("posts.when")}</dt>
          <dd>
            {post.publishedAt
              ? t("posts.publishedAt", { date: date(post.publishedAt) })
              : post.scheduledAt
                ? t("posts.scheduledFor", { date: date(post.scheduledAt) })
                : t("posts.notScheduled")}
          </dd>
        </div>
        {post.permalink ? (
          <div>
            <dt className="text-muted-foreground">{t("post.permalink")}</dt>
            <dd>
              <a href={post.permalink} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                {post.permalink}
              </a>
            </dd>
          </div>
        ) : null}
        {post.status === "FAILED" && post.lastError ? (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">{t("post.error")}</dt>
            <dd className="text-destructive">{post.lastError}</dd>
          </div>
        ) : null}
      </dl>

      <PostEditor
        post={{
          id: post.id,
          channel: post.channel,
          status: post.status,
          message: post.message,
          imagePath: post.imagePath,
          scheduledAt: post.scheduledAt?.toISOString() ?? null,
          accountName: post.account.name,
        }}
        editable={post.editable}
        readOnly={post.readOnly}
        promotable={post.promotable}
      />
    </div>
  );
}
