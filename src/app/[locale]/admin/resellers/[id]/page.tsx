import { getTranslations, setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { PosTotalsCards, ruleLabel } from "@/components/resellers/pos-stats";
import { Link } from "@/i18n/navigation";
import { commissionRule } from "@/lib/resellers/commission";
import { getManagedReseller } from "@/lib/resellers/data";
import { nextReportAt } from "@/lib/resellers/report";
import { t as translate, type Translated } from "@/lib/types";
import { formatDate, formatPrice } from "@/lib/utils";
import { ResellerForm } from "../reseller-form";
import {
  AssignEventForm,
  EventCommissionEditor,
  InviteAgentForm,
  RevokeAgentButton,
  SendReportButtons,
} from "./manage";

export const dynamic = "force-dynamic";

export default async function ResellerPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { admin, reseller, stats, assignable, organizers } = await getManagedReseller(id);
  const t = await getTranslations("admin.resellers");
  const ta = await getTranslations("admin");
  const ts = await getTranslations("pos.stats");
  const money = (cents: number) => formatPrice(cents, `${locale}-CH`);
  const defaultRule = await ruleLabel(commissionRule(reseller), locale);
  const showOrganizer = admin && reseller.organizerId == null;

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted-foreground">
          <Link href="/admin/resellers" className="hover:text-foreground">
            {t("back")}
          </Link>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl">{reseller.name}</h1>
          <Badge variant="secondary">{ta(`resellerType.${reseller.type}`)}</Badge>
          {!reseller.active ? <Badge variant="outline">{t("inactive")}</Badge> : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {[
            reseller.city,
            admin ? (reseller.organizer?.name ?? t("allOrganizers")) : null,
            t("defaultRule", { rule: defaultRule }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      <PosTotalsCards stats={stats} locale={locale} />

      <section className="space-y-4">
        <div>
          <h2 className="text-lg">{t("showsTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("showsHint")}</p>
        </div>
        {stats.events.length === 0 ? (
          <p className="rounded-card border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t("noShows")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-border">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{ts("show")}</th>
                  <th className="px-4 py-3 font-medium">{ts("rule")}</th>
                  <th className="px-4 py-3 text-right font-medium">{ts("tickets")}</th>
                  <th className="px-4 py-3 text-right font-medium">{ts("amount")}</th>
                  <th className="px-4 py-3 text-right font-medium">{ts("commission")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stats.events.map((e) => {
                  const when = e.nextStartsAt ?? e.lastStartsAt;
                  return (
                    <tr key={e.eventId} className="align-top">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/events/${e.eventId}`}
                          className="font-medium hover:text-primary hover:underline"
                        >
                          {translate(e.title as Translated, locale)}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {[
                            showOrganizer ? e.organizerName : null,
                            when
                              ? e.nextStartsAt
                                ? ts("next", { date: formatDate(when, `${locale}-CH`) })
                                : ts("last", { date: formatDate(when, `${locale}-CH`) })
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <EventCommissionEditor
                          resellerId={reseller.id}
                          eventId={e.eventId}
                          kind={e.overridden ? e.rule.kind : null}
                          bps={e.rule.bps}
                          fixedCents={e.rule.fixedCents}
                          inheritLabel={t("inheritRule", { rule: defaultRule })}
                        />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {e.tickets}
                        {e.pendingTickets > 0 ? (
                          <span className="block text-xs text-muted-foreground">
                            {ts("pending", { count: e.pendingTickets })}
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
        )}
        <AssignEventForm
          resellerId={reseller.id}
          events={assignable.map((e) => ({
            id: e.id,
            label: [
              translate(e.title as Translated, locale),
              admin && reseller.organizerId == null ? e.organizer.name : null,
              e.status === "DRAFT" ? ta("status.DRAFT") : null,
            ]
              .filter(Boolean)
              .join(" · "),
          }))}
        />
      </section>

      <section className="space-y-4 rounded-card border border-border bg-card p-6">
        <div>
          <h2 className="text-lg">{t("agentsTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("agentsHint")}</p>
        </div>
        {reseller.agents.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noAgents")}</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {reseller.agents.map((agent) => (
              <li key={agent.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{agent.name ?? agent.email}</span>
                  {agent.name ? <span className="block text-xs text-muted-foreground">{agent.email}</span> : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  {agent.activated
                    ? agent.lastLoginAt
                      ? t("lastLogin", { date: formatDate(agent.lastLoginAt, `${locale}-CH`) })
                      : t("activated")
                    : t("invitationPending")}
                </span>
                <RevokeAgentButton resellerId={reseller.id} userId={agent.id} />
              </li>
            ))}
          </ul>
        )}
        <InviteAgentForm resellerId={reseller.id} locale={locale} />
      </section>

      <section className="space-y-3 rounded-card border border-border bg-card p-6">
        <div>
          <h2 className="text-lg">{t("reportsTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(`reportStatus.${reseller.reportFrequency}`)}
            {reseller.reportFrequency !== "NONE"
              ? ` · ${t("nextReport", {
                  date: formatDate(
                    nextReportAt(reseller.reportFrequency, reseller.lastReportAt),
                    `${locale}-CH`,
                  ),
                })}`
              : null}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("reportRecipients", {
              emails: [reseller.email, ...reseller.notifyEmails].join(", "),
            })}
          </p>
        </div>
        <SendReportButtons resellerId={reseller.id} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg">{t("settingsTitle")}</h2>
        <ResellerForm
          values={{ ...reseller, notifyEmails: reseller.notifyEmails }}
          organizers={admin ? organizers : null}
        />
      </section>
    </div>
  );
}
