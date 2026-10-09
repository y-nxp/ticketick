import { getTranslations, setRequestLocale } from "next-intl/server";
import { Gift, TicketCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { statsActor } from "@/lib/admin/access";
import { getInvitationSummary, type InvitationSession } from "@/lib/invitations/summary";
import { inviteReportRecipients } from "@/lib/invitations/report";
import { prisma } from "@/lib/prisma";
import { nextReportAt } from "@/lib/resellers/report";
import { t as translate, type Translated } from "@/lib/types";
import { EVENT_TIME_ZONE, formatDate, formatPrice } from "@/lib/utils";
import { InviteReportSettings } from "./report-settings";

export const dynamic = "force-dynamic";

export default async function InvitationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ organizer?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { organizerId: own, readOnly } = await statsActor();
  const t = await getTranslations("admin.invitations");
  const intl = `${locale}-CH`;
  const money = (cents: number) => formatPrice(cents, intl);

  const organizers = own
    ? []
    : await prisma.organizer.findMany({
        where: { events: { some: { sessions: { some: { startsAt: { gte: new Date() } } } } } },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
  const requested = (await searchParams).organizer;
  const organizerId =
    own ?? organizers.find((o) => o.id === requested)?.id ?? organizers[0]?.id ?? null;

  if (!organizerId) {
    return (
      <div>
        <h1 className="text-2xl">{t("title")}</h1>
        <p className="mt-6 rounded-card border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {t("noOrganizer")}
        </p>
      </div>
    );
  }

  const [organizer, { sessions, totals }] = await Promise.all([
    prisma.organizer.findUniqueOrThrow({
      where: { id: organizerId },
      select: {
        name: true,
        notifyEmails: true,
        inviteReportEmails: true,
        inviteReportFrequency: true,
        lastInviteReportAt: true,
      },
    }),
    getInvitationSummary(organizerId),
  ]);

  const byEvent = new Map<string, InvitationSession[]>();
  for (const s of sessions) byEvent.set(s.eventId, [...(byEvent.get(s.eventId) ?? []), s]);
  const when = (date: Date) =>
    new Intl.DateTimeFormat(intl, {
      timeZone: EVENT_TIME_ZONE,
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  const settle = (r: InvitationSession["reservations"][number]) =>
    r.awaitingPayment
      ? t("settle.awaiting")
      : t(`settle.${["RESERVATION", "IBAN", "CASH", "CARD", "TERMINAL"].includes(r.paymentMethod) ? r.paymentMethod : "OTHER"}`);
  const frequency = organizer.inviteReportFrequency;
  const recipients = inviteReportRecipients(organizer);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        {organizers.length > 1 ? (
          <nav aria-label={t("organizer")} className="mt-4 flex flex-wrap gap-2">
            {organizers.map((o) => (
              <Link
                key={o.id}
                href={{ pathname: "/admin/invitations", query: { organizer: o.id } }}
                aria-current={o.id === organizerId ? "page" : undefined}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  o.id === organizerId
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted"
                }`}
              >
                {o.name}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("guestHeld")} value={String(totals.guestHeld)} hint={t("guestHeldHint")} />
        <Stat label={t("offered")} value={String(totals.offered)} />
        <Stat
          label={t("paid")}
          value={String(totals.paid)}
          hint={totals.paidCents > 0 ? money(totals.paidCents) : undefined}
        />
        <Stat
          label={t("onSale")}
          value={String(totals.onSale)}
          hint={t("soldHint", { count: totals.sold })}
        />
      </div>

      {sessions.length === 0 ? (
        <p className="rounded-card border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          <Gift className="mx-auto mb-3 size-6" />
          {t("empty")}
        </p>
      ) : (
        [...byEvent.entries()].map(([eventId, rows]) => (
          <section key={eventId} className="space-y-3 rounded-card border border-border bg-card p-5">
            <h2 className="text-lg">
              <Link href={`/admin/events/${eventId}`} className="hover:text-primary hover:underline">
                {translate(rows[0]!.eventTitle as Translated, locale)}
              </Link>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">{t("date")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("guestHeld")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("offered")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("paid")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("sold")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("onSale")}</th>
                    {readOnly ? null : <th className="py-2 pl-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((s) => (
                    <tr key={s.sessionId} className="align-top">
                      <td className="py-2.5 pr-3">
                        <span className="font-medium">{when(s.startsAt)}</span>
                        <span className="block text-xs text-muted-foreground">
                          {[s.venue, s.seated ? t("seated") : t("freeSeating")].filter(Boolean).join(" · ")}
                        </span>
                        {s.reservations.length > 0 ? (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs font-medium text-primary">
                              {t("reservations", { count: s.reservations.length })}
                            </summary>
                            <ul className="mt-2 space-y-1.5">
                              {s.reservations.map((r) => (
                                <li key={r.orderId} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                                  <span className="font-medium">
                                    {[r.name, r.note].filter(Boolean).join(" · ") || t("noName")}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {t("places", { count: r.places })}
                                  </span>
                                  <Badge variant={r.paymentMethod === "RESERVATION" ? "secondary" : "outline"}>
                                    {settle(r)}
                                    {r.paymentMethod !== "RESERVATION" && r.paidCents > 0
                                      ? ` · ${money(r.paidCents)}`
                                      : ""}
                                  </Badge>
                                  <Link
                                    href={`/admin/orders/${r.orderId}`}
                                    className="font-mono text-muted-foreground hover:text-primary hover:underline"
                                  >
                                    {r.reference}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{s.guestHeld}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{s.offered}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {s.paid}
                        {s.paidCents > 0 ? (
                          <span className="block text-xs text-muted-foreground">{money(s.paidCents)}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{s.sold}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{s.onSale}</td>
                      {readOnly ? null : (
                        <td className="py-2 pl-3 text-right">
                          <Link
                            href={`/admin/events/${eventId}/reserve/${s.sessionId}`}
                            className={buttonVariants({ variant: "ghost", size: "sm" })}
                          >
                            <TicketCheck className="size-4" />
                            {t("reserve")}
                          </Link>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      <section className="space-y-4 rounded-card border border-border bg-card p-6">
        <div>
          <h2 className="text-lg">{t("reportTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(`reportStatus.${frequency}`)}
            {frequency !== "NONE"
              ? ` · ${t("nextReport", {
                  date: formatDate(nextReportAt(frequency, organizer.lastInviteReportAt), intl, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                })}`
              : null}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {recipients.length > 0
              ? t("reportRecipients", { emails: recipients.join(", ") })
              : t("noRecipients")}
          </p>
        </div>
        {readOnly ? null : (
          <InviteReportSettings
            organizerId={organizerId}
            frequency={frequency}
            emails={organizer.inviteReportEmails.join("\n")}
            fallback={organizer.notifyEmails.join(", ")}
          />
        )}
      </section>
    </div>
  );
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
