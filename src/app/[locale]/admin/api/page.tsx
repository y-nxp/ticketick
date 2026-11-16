import { getTranslations, setRequestLocale } from "next-intl/server";
import { Bot, KeyRound, Plug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { publicAppOrigin } from "@/lib/app-url";
import { getApiKeys } from "@/lib/data/admin";
import { formatDate } from "@/lib/utils";
import { OrganizerPicker } from "../team/team-forms";
import { CopyValue, CreateKeyForm, RevokeKeyButton } from "./api-key-forms";

export const dynamic = "force-dynamic";

export default async function AdminApiPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ o?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { o } = await searchParams;

  const data = await getApiKeys(o);
  const t = await getTranslations("admin.api");
  const origin = publicAppOrigin();
  const mcpUrl = `${origin}/api/mcp`;
  const date = (d: Date) =>
    formatDate(d, `${locale}-CH`, { day: "2-digit", month: "short", year: "numeric" });

  const claudeCode = `claude mcp add --transport http ticketick ${mcpUrl} \\\n  --header "Authorization: Bearer tt_…"`;
  const mcpJson = JSON.stringify(
    {
      mcpServers: {
        ticketick: { type: "http", url: mcpUrl, headers: { Authorization: "Bearer tt_…" } },
      },
    },
    null,
    2,
  );

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("subtitle")}</p>

      {data.organizers.length > 0 ? (
        <OrganizerPicker organizers={data.organizers} value={data.organizerId ?? ""} pathname="/admin/api" />
      ) : null}

      {data.organizerId ? (
        <>
          <section className="mt-6 rounded-card border border-border bg-card p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <KeyRound className="size-5 text-primary" />
              {t("newKey")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("newKeyHint")}</p>
            <CreateKeyForm organizerId={data.organizerId} />
          </section>

          <div className="mt-6 overflow-x-auto rounded-card border border-border">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">{t("keyName")}</th>
                  <th className="px-4 py-3 font-semibold">{t("rights")}</th>
                  <th className="px-4 py-3 font-semibold">{t("events")}</th>
                  <th className="px-4 py-3 font-semibold">{t("lastUsed")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.keys.map((k) => (
                  <tr key={k.id} className={k.revokedAt ? "opacity-60" : undefined}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{k.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {k.prefix}… · {t("createdOn", { date: date(k.createdAt) })}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {k.revokedAt ? (
                        <Badge variant="secondary">{t("revoked")}</Badge>
                      ) : (
                        <Badge variant={k.canPublish ? "default" : "secondary"}>
                          {t(k.canPublish ? "rightsPublish" : "rightsDraft")}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{k.events}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {k.lastUsedAt ? date(k.lastUsedAt) : t("never")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {k.revokedAt ? null : <RevokeKeyButton id={k.id} name={k.name} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.keys.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">{t("empty")}</p>
            ) : null}
          </div>
        </>
      ) : null}

      <section className="mt-8 rounded-card border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Plug className="size-5 text-primary" />
          {t("connectTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("connectHint")}</p>
        <div className="mt-4 space-y-4">
          <div>
            <p className="text-sm font-medium">{t("mcpUrl")}</p>
            <div className="mt-1.5">
              <CopyValue value={mcpUrl} />
            </div>
          </div>
          <div>
            <p className="text-sm font-medium">{t("claudeCode")}</p>
            <div className="mt-1.5">
              <CopyValue value={claudeCode} multiline />
            </div>
          </div>
          <div>
            <p className="text-sm font-medium">{t("mcpJson")}</p>
            <p className="text-xs text-muted-foreground">{t("mcpJsonHint")}</p>
            <div className="mt-1.5">
              <CopyValue value={mcpJson} multiline />
            </div>
          </div>
        </div>
        <p className="mt-5 flex items-start gap-2 text-sm text-muted-foreground">
          <Bot className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            {t("docsHint")}{" "}
            <Link href="/developers" className="font-medium text-primary hover:underline">
              {t("docsLink")}
            </Link>
          </span>
        </p>
      </section>
    </div>
  );
}
