import { getTranslations, setRequestLocale } from "next-intl/server";
import { BarChart3, Bus, TicketCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { statsActor } from "@/lib/admin/access";
import { canSeePromotionUi } from "@/lib/admin/promotion-visibility";
import { hasPromotionCampaigns } from "@/lib/promotion/results-store";
import { reportRecipients, reportSince } from "@/lib/reports/report";
import {
  DEFAULT_REPORT_SECTIONS,
  getOrganizerReport,
  readSections,
  type ReportSection,
  type ReportSession,
} from "@/lib/reports/summary";
import { prisma } from "@/lib/prisma";
import { nextReportAt } from "@/lib/resellers/report";
import { t as translate, type Translated } from "@/lib/types";
import { EVENT_TIME_ZONE, formatDate, formatPrice } from "@/lib/utils";
import { ReportSettings, SendReportNow } from "./report-settings";

export const dynamic = "force-dynamic";

/** Vues de la page : « Promotion » n'y a pas de colonne, ses chiffres sont sur `/admin/promotion`. */
const VIEWS = ["all", ...DEFAULT_REPORT_SECTIONS] as const;
type View = (typeof VIEWS)[number];

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ organizer?: string; view?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, organizerId: own, readOnly } = await statsActor();
  const t = await getTranslations("admin.reports");
  const intl = `${locale}-CH`;
  const money = (cents: number) => formatPrice(cents, intl);
  const query = await searchParams;
  const view: View = VIEWS.includes(query.view as View) ? (query.view as View) : "all";
  const shown: ReportSection[] = view === "all" ? [...DEFAULT_REPORT_SECTIONS] : [view];
  const has = (section: ReportSection) => shown.includes(section);

  const organizers = own
    ? []
    : await prisma.organizer.findMany({
        where: { events: { some: { sessions: { some: { startsAt: { gte: new Date() } } } } } },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
  const organizerId =
    own ?? organizers.find((o) => o.id === query.organizer)?.id ?? organizers[0]?.id ?? null;

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

  const organizer = await prisma.organizer.findUniqueOrThrow({
    where: { id: organizerId },
    select: {
      name: true,
      notifyEmails: true,
      reportEmails: true,
      reportFrequency: true,
      reportWeekday: true,
      reportHour: true,
      reportSections: true,
      lastReportAt: true,
      lastReportSentAt: true,
    },
  });
  const since = reportSince(organizer.lastReportSentAt);
  const [{ sessions, totals }, promotionOffered] = await Promise.all([
    getOrganizerReport(organizerId, { since, locale }),
    canSeePromotionUi(user) ? hasPromotionCampaigns(organizerId) : false,
  ]);
  const savedSections = readSections(organizer.reportSections);
  // Envoi immédiat de « Tout » : la partie Promotion suit le réglage enregistré.
  const sendSections: ReportSection[] =
    view === "all" && savedSections.includes("promotion") ? [...shown, "promotion"] : shown;

  const byEvent = new Map<string, ReportSession[]>();
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
  const settle = (r: ReportSession["reservations"][number]) =>
    r.awaitingPayment
      ? t("settle.awaiting")
      : t(`settle.${["RESERVATION", "IBAN", "CASH", "CARD", "TERMINAL"].includes(r.paymentMethod) ? r.paymentMethod : "OTHER"}`);
  const href = (next: { view?: View }) => ({
    pathname: "/admin/reports",
    query: {
      ...(own ? {} : { organizer: organizerId }),
      ...((next.view ?? view) === "all" ? {} : { view: next.view ?? view }),
    },
  });
  const sinceLabel = formatDate(since, intl, { weekday: undefined, year: undefined });
  const frequency = organizer.reportFrequency;
  const schedule = { weekday: organizer.reportWeekday, hour: organizer.reportHour };
  const weekdays = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
    value: String(d),
    label: new Intl.DateTimeFormat(intl, { weekday: "long", timeZone: "UTC" }).format(
      new Date(Date.UTC(2024, 0, d)),
    ),
  }));
  const time = `${String(schedule.hour).padStart(2, "0")}:00`;
  const recipients = reportRecipients(organizer);
  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm transition-colors ${
      active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
    }`;

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <div>
          <h1 className="text-2xl">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {organizers.length > 1 ? (
          <nav aria-label={t("organizer")} className="flex flex-wrap gap-2">
            {organizers.map((o) => (
              <Link
                key={o.id}
                href={{
                  pathname: "/admin/reports",
                  query: { organizer: o.id, ...(view === "all" ? {} : { view }) },
                }}
                aria-current={o.id === organizerId ? "page" : undefined}
                className={pill(o.id === organizerId)}
              >
                {o.name}
              </Link>
            ))}
          </nav>
        ) : null}
        <nav aria-label={t("filter")} className="flex flex-wrap gap-2">
          {VIEWS.map((v) => (
            <Link key={v} href={href({ view: v })} aria-current={v === view ? "page" : undefined} className={pill(v === view)}>
              {t(`views.${v}`)}
            </Link>
          ))}
        </nav>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {has("sales") ? (
          <>
            <Stat
              label={t("sold")}
              value={String(totals.sold)}
              hint={t("soldNewHint", { count: totals.soldNew, date: sinceLabel })}
            />
            <Stat
              label={t("revenue")}
              value={money(totals.revenueCents)}
              hint={totals.pending > 0 ? t("pendingHint", { count: totals.pending }) : undefined}
            />
          </>
        ) : null}
        {has("invitations") ? (
          <>
            <Stat label={t("guestHeld")} value={String(totals.guestHeld)} hint={t("guestHeldHint")} />
            <Stat
              label={t("invited")}
              value={String(totals.offered + totals.paid)}
              hint={t("invitedHint", {
                offered: totals.offered,
                paid: totals.paid,
                amount: money(totals.paidCents),
              })}
            />
          </>
        ) : null}
        {has("remaining") ? <Stat label={t("onSale")} value={String(totals.onSale)} /> : null}
      </div>

      {sessions.length === 0 ? (
        <p className="rounded-card border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          <BarChart3 className="mx-auto mb-3 size-6" />
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
              <table className={`w-full text-sm ${view === "all" ? "min-w-[60rem]" : "min-w-[36rem]"}`}>
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">{t("date")}</th>
                    {has("sales") ? (
                      <>
                        <Th>{t("sold")}</Th>
                        <Th>{t("soldNew")}</Th>
                        <Th>{t("revenue")}</Th>
                        <Th>{t("pending")}</Th>
                      </>
                    ) : null}
                    {has("invitations") ? (
                      <>
                        <Th>{t("guestHeld")}</Th>
                        <Th>{t("offered")}</Th>
                        <Th>{t("paid")}</Th>
                      </>
                    ) : null}
                    {has("remaining") ? <Th>{t("onSale")}</Th> : null}
                    {has("invitations") && !readOnly ? <th className="py-2 pl-3" /> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((s) => (
                    <tr key={s.sessionId} className="align-top">
                      <td className="min-w-56 py-2.5 pr-3">
                        <span className="font-medium">{when(s.startsAt)}</span>
                        <span className="block text-xs text-muted-foreground">
                          {[s.venue, s.seated ? t("seated") : t("freeSeating")].filter(Boolean).join(" · ")}
                        </span>
                        {has("invitations") && s.reservations.length > 0 ? (
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
                                  <span className="text-muted-foreground">{t("places", { count: r.places })}</span>
                                  <Badge
                                    variant={r.paymentMethod === "RESERVATION" ? "secondary" : "outline"}
                                    className="whitespace-nowrap"
                                  >
                                    {settle(r)}
                                    {r.paymentMethod !== "RESERVATION" && r.paidCents > 0 ? ` · ${money(r.paidCents)}` : ""}
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
                      {has("sales") ? (
                        <>
                          <Td>{s.sold}</Td>
                          <Td>{s.soldNew > 0 ? `+${s.soldNew}` : "–"}</Td>
                          <Td>{s.revenueCents > 0 ? money(s.revenueCents) : "–"}</Td>
                          <Td>{s.pending > 0 ? s.pending : "–"}</Td>
                        </>
                      ) : null}
                      {has("invitations") ? (
                        <>
                          <Td>{s.guestHeld}</Td>
                          <Td>{s.offered}</Td>
                          <Td>
                            {s.paid}
                            {s.paidCents > 0 ? (
                              <span className="block text-xs text-muted-foreground">{money(s.paidCents)}</span>
                            ) : null}
                          </Td>
                        </>
                      ) : null}
                      {has("remaining") ? <Td>{s.onSale}</Td> : null}
                      {has("invitations") && !readOnly ? (
                        <td className="py-2 pl-3 text-right">
                          <Link
                            href={`/admin/events/${eventId}/reserve/${s.sessionId}`}
                            className={`${buttonVariants({ variant: "ghost", size: "sm" })} whitespace-nowrap`}
                          >
                            <TicketCheck className="size-4" />
                            {t("reserve")}
                          </Link>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {has("sales")
              ? rows
                  .filter((s) => s.options.length > 0)
                  .map((s) => (
                    <SessionOptions
                      key={s.sessionId}
                      options={s.options}
                      heading={[when(s.startsAt), s.venue].filter(Boolean).join(" · ")}
                    />
                  ))
              : null}
          </section>
        ))
      )}

      <section className="space-y-4 rounded-card border border-border bg-card p-6">
        <div>
          <h2 className="text-lg">{t("reportTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(`reportStatus.${frequency}`, {
              weekday: weekdays[schedule.weekday - 1]?.label ?? "",
              time,
            })}
            {frequency !== "NONE"
              ? ` · ${t("nextReport", {
                  date: formatDate(nextReportAt(frequency, organizer.lastReportAt, new Date(), schedule), intl, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: undefined,
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
          <>
            <SendReportNow organizerId={organizerId} sections={sendSections} label={t(`sendNow.${view}`)} />
            <ReportSettings
              organizerId={organizerId}
              frequency={frequency}
              weekday={schedule.weekday}
              hour={schedule.hour}
              weekdays={weekdays}
              emails={organizer.reportEmails.join("\n")}
              sections={savedSections}
              promotionOffered={promotionOffered}
              fallback={organizer.notifyEmails.join(", ")}
            />
          </>
        )}
      </section>
    </div>
  );
}

/** Options choisies (navette…) : personnes par choix, puis la liste des inscrits. */
async function SessionOptions({
  options,
  heading,
}: {
  options: ReportSession["options"];
  heading: string;
}) {
  const t = await getTranslations("admin.reports");
  return (
    <div className="space-y-3 border-t border-border pt-4">
      <h3 className="text-sm font-medium">{t("optionsHeading", { date: heading })}</h3>
      {options.map((o) => (
        <div key={o.optionId} className="rounded-control border border-border bg-muted/40 p-4">
          <p className="flex items-start gap-2 text-sm font-medium">
            <Bus className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              {o.title}
              <span className="block text-xs font-normal text-muted-foreground">
                {t("optionsSummary", { orders: o.orders, people: o.people })}
              </span>
            </span>
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {[...o.groups, ...(o.other.length ? [{ title: t("optionsOther"), choices: o.other }] : [])].map((g) => (
              <div key={g.title} className="rounded-control border border-border bg-card p-3">
                {g.title ? <p className="text-xs font-medium text-muted-foreground">{g.title}</p> : null}
                <ul className="mt-1.5 divide-y divide-border text-sm">
                  {g.choices.map((c) => (
                    <li key={c.label} className="flex items-baseline justify-between gap-3 py-1.5">
                      <span>{c.label}</span>
                      <span className="whitespace-nowrap text-right tabular-nums">
                        <span className="font-semibold">{t("people", { count: c.people })}</span>
                        <span className="block text-xs text-muted-foreground">
                          {t("orders", { count: c.orders })}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium text-primary">
              {t("optionsBuyers", { count: o.buyers.length })}
            </summary>
            <div className="mt-2 rounded-control border border-border bg-card text-sm">
              <div className="hidden grid-cols-[minmax(0,1.2fr)_5rem_minmax(0,1.5fr)_9rem_6rem] gap-3 border-b border-border px-3 py-2 text-xs text-muted-foreground md:grid">
                <span>{t("buyerName")}</span>
                <span className="text-right">{t("buyerPeople")}</span>
                <span>{t("buyerChoices")}</span>
                <span>{t("buyerPhone")}</span>
                <span>{t("buyerOrder")}</span>
              </div>
              <ul className="divide-y divide-border">
                {o.buyers.map((b) => (
                  <li
                    key={b.orderId}
                    className="grid gap-x-3 gap-y-1 px-3 py-2.5 md:grid-cols-[minmax(0,1.2fr)_5rem_minmax(0,1.5fr)_9rem_6rem]"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{b.name || t("noName")}</span>
                      <span className="text-muted-foreground md:hidden"> · {t("people", { count: b.people })}</span>
                      <span className="block truncate text-xs text-muted-foreground">{b.email}</span>
                    </span>
                    <span className="hidden text-right tabular-nums md:block">{b.people}</span>
                    <span>
                      {b.choices.map((c) => (
                        <span key={c} className="block">{c}</span>
                      ))}
                    </span>
                    <span className="flex flex-wrap gap-x-3 text-xs md:contents md:text-sm">
                      {b.phone ? (
                        <a href={`tel:${b.phone}`} className="whitespace-nowrap hover:text-primary hover:underline">
                          {b.phone}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                      <Link
                        href={`/admin/orders/${b.orderId}`}
                        className="font-mono text-xs text-muted-foreground hover:text-primary hover:underline"
                      >
                        {b.reference}
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </div>
      ))}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-right font-medium">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2.5 text-right tabular-nums">{children}</td>;
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
