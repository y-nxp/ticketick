import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChartColumn, CreditCard, ScanLine, UserPlus } from "lucide-react";
import { TillSettings } from "@/components/admin/till-settings";
import { Badge } from "@/components/ui/badge";
import { getTeam } from "@/lib/data/admin";
import { t as tr } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { InviteForm, OrganizerPicker, RevokeButton } from "./team-forms";

export const dynamic = "force-dynamic";

export default async function AdminTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ o?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { o } = await searchParams;

  const team = await getTeam(o);
  const t = await getTranslations("admin.team");

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>

      {team.organizers.length > 0 ? (
        <OrganizerPicker
          organizers={team.organizers}
          value={team.organizerId ?? ""}
        />
      ) : null}

      {team.organizerId ? (
        <>
          <section className="mt-6 rounded-card border border-border bg-card p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <UserPlus className="size-5 text-primary" />
              {t("invite")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("inviteHint")}
            </p>
            <InviteForm
              organizerId={team.organizerId}
              locale={locale}
              events={team.events.map((e) => ({
                id: e.id,
                label: [
                  tr(e.title, locale),
                  e.firstAt ? formatDate(e.firstAt, `${locale}-CH`, { day: "2-digit", month: "2-digit", year: "numeric" }) : null,
                ]
                  .filter(Boolean)
                  .join(" · "),
              }))}
            />
          </section>

          <TillSettings organizerId={team.organizerId} />

          <div className="mt-6 overflow-x-auto rounded-card border border-border">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">{t("person")}</th>
                  <th className="px-4 py-3 font-semibold">{t("access")}</th>
                  <th className="px-4 py-3 font-semibold">{t("status")}</th>
                  <th className="px-4 py-3 font-semibold">{t("lastLogin")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {team.members.map((v) => (
                  <tr key={v.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{v.name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{v.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      {v.access === "door" ? (
                        <span className="flex flex-col gap-1">
                          {v.scan ? (
                            <span className="inline-flex items-center gap-1.5 font-medium">
                              <ScanLine className="size-4 shrink-0 text-primary" />
                              {t("doorScan")}
                            </span>
                          ) : null}
                          {v.till ? (
                            <span className="inline-flex items-center gap-1.5 font-medium">
                              <CreditCard className="size-4 shrink-0 text-primary" />
                              {t("doorTill")}
                              <span className="text-xs font-normal text-muted-foreground">
                                · {v.tillEvent ? tr(v.tillEvent, locale) : t("tillEventAll")}
                              </span>
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <ChartColumn className="size-4 shrink-0 text-primary" />
                          {t("accessStats")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={v.activated ? "default" : "secondary"}>
                        {t(v.activated ? "active" : "pending")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {v.lastLoginAt
                        ? formatDate(v.lastLoginAt, `${locale}-CH`, {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RevokeButton
                        userId={v.id}
                        organizerId={team.organizerId!}
                        email={v.email}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {team.members.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {t("empty")}
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
