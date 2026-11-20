import { getTranslations, setRequestLocale } from "next-intl/server";
import { AlertTriangle, ArrowLeft, Download, Music } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { statsActor } from "@/lib/admin/access";
import { prisma } from "@/lib/prisma";
import { getSuisaReport, readSuisaQuery, type SuisaFigures, type SuisaRow } from "@/lib/reports/suisa";
import { t as translate, type Translated } from "@/lib/types";
import { EVENT_TIME_ZONE, formatPrice } from "@/lib/utils";
import { DoorSalesForm, MusicSelect, PrintButton } from "./suisa-forms";

export const dynamic = "force-dynamic";

export default async function SuisaReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ organizer?: string; from?: string; to?: string; tva?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { organizerId: own, readOnly } = await statsActor();
  const t = await getTranslations("admin.suisa");
  const intl = `${locale}-CH`;
  const money = (cents: number) => formatPrice(cents, intl);
  const query = await searchParams;
  const { from, to, vatPercent } = readSuisaQuery(query);

  const organizers = own
    ? []
    : await prisma.organizer.findMany({
        where: { events: { some: {} } },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
  const organizerId = own ?? organizers.find((o) => o.id === query.organizer)?.id ?? organizers[0]?.id ?? null;
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
  const organizerName =
    organizers.find((o) => o.id === organizerId)?.name ??
    (await prisma.organizer.findUnique({ where: { id: organizerId }, select: { name: true } }))?.name ??
    "";

  const report = await getSuisaReport(organizerId, { from, to, vatPercent });
  const { rows, totals, protectedTotals, unmarked } = report;
  const pending = totals.pending;

  const keep = {
    ...(own ? {} : { organizer: organizerId }),
    from,
    to,
    ...(vatPercent > 0 ? { tva: String(vatPercent) } : {}),
  };
  const exportHref = `${locale === "fr" ? "" : `/${locale}`}/admin/reports/suisa/export?${new URLSearchParams(keep)}`;
  const day = (d: string) =>
    new Intl.DateTimeFormat(intl, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(`${d}T12:00:00Z`),
    );
  const when = (date: Date) =>
    new Intl.DateTimeFormat(intl, {
      timeZone: EVENT_TIME_ZONE,
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm transition-colors ${
      active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
    }`;
  const musicLabel = (r: SuisaRow) => t(`musicValues.${r.music ?? "unset"}`);

  return (
    <div className="space-y-8 print:space-y-4">
      <header className="space-y-4">
        <Link
          href={{ pathname: "/admin/reports", query: own ? {} : { organizer: organizerId } }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary print:hidden"
        >
          <ArrowLeft className="size-4" />
          {t("back")}
        </Link>
        <div>
          <h1 className="text-2xl">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground print:hidden">{t("subtitle")}</p>
          <p className="mt-1 hidden text-sm print:block">
            {organizerName} · {t("period", { from: day(from), to: day(to) })}
          </p>
        </div>
        {organizers.length > 1 ? (
          <nav aria-label={t("organizer")} className="flex flex-wrap gap-2 print:hidden">
            {organizers.map((o) => (
              <Link
                key={o.id}
                href={{ pathname: "/admin/reports/suisa", query: { ...keep, organizer: o.id } }}
                aria-current={o.id === organizerId ? "page" : undefined}
                className={pill(o.id === organizerId)}
              >
                {o.name}
              </Link>
            ))}
          </nav>
        ) : null}
        <form method="get" className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-card p-4 print:hidden">
          {own ? null : <input type="hidden" name="organizer" value={organizerId} />}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("from")}</span>
            <input type="date" name="from" defaultValue={from} className="h-10 rounded-control border border-border bg-background px-3" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("to")}</span>
            <input type="date" name="to" defaultValue={to} className="h-10 rounded-control border border-border bg-background px-3" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("vat")}</span>
            <input
              name="tva"
              inputMode="decimal"
              defaultValue={vatPercent > 0 ? String(vatPercent) : ""}
              placeholder="0"
              className="h-10 w-24 rounded-control border border-border bg-background px-3 text-right"
            />
          </label>
          <Button type="submit">{t("show")}</Button>
          <span className="ml-auto flex flex-wrap gap-2">
            <a href={exportHref} download className={buttonVariants({ variant: "outline" })}>
              <Download className="size-4" />
              {t("download")}
            </a>
            <PrintButton />
          </span>
          <p className="w-full text-xs text-muted-foreground">{t("vatHint")}</p>
        </form>
      </header>

      {unmarked > 0 || pending > 0 ? (
        <div className="space-y-1 rounded-card border border-amber-500/50 bg-amber-500/10 p-4 text-sm print:hidden">
          {unmarked > 0 ? (
            <p className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
              {t("unmarked", { count: unmarked })}
            </p>
          ) : null}
          {pending > 0 ? (
            <p className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
              {t("pendingWarning", { count: pending })}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("concerts")} value={String(totals.sessions)} hint={t("protectedHint", { count: protectedTotals.sessions })} />
        <Stat label={t("paid")} value={String(totals.paidTotal)} hint={t("offeredHint", { count: totals.offered })} />
        <Stat label={t("gross")} value={money(totals.grossCents)} hint={t("doorHint", { amount: money(totals.doorCents) })} />
        <Stat
          label={t("base")}
          value={money(totals.baseCents)}
          hint={vatPercent > 0 ? t("baseHintVat", { rate: vatPercent }) : t("baseHintNoVat")}
        />
      </div>

      {rows.length === 0 ? (
        <p className="rounded-card border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          <Music className="mx-auto mb-3 size-6" />
          {t("empty")}
        </p>
      ) : (
        <section className="rounded-card border border-border bg-card p-5 print:border-0 print:p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[68rem] text-sm print:min-w-0 print:text-xs">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">{t("date")}</th>
                  <th className="px-3 py-2 font-medium">{t("concert")}</th>
                  <th className="px-3 py-2 font-medium">{t("music")}</th>
                  <Th>{t("capacity")}</Th>
                  <Th>{t("paidShort")}</Th>
                  <Th>{t("offeredShort")}</Th>
                  <Th>{t("total")}</Th>
                  <Th>{t("ticketick")}</Th>
                  <Th>{t("door")}</Th>
                  <Th>{t("gross")}</Th>
                  {vatPercent > 0 ? <Th>{t("base")}</Th> : null}
                  <Th>{t("category")}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.sessionId} className={`align-top ${r.music === "NONE" ? "text-muted-foreground" : ""}`}>
                    <td className="whitespace-nowrap py-2.5 pr-3">{when(r.startsAt)}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`/admin/events/${r.eventId}`} className="font-medium hover:text-primary hover:underline">
                        {r.music === "PROTECTED" ? "* " : ""}
                        {translate(r.eventTitle as Translated, locale)}
                      </Link>
                      {r.venue ? <span className="block text-xs text-muted-foreground">{r.venue}</span> : null}
                      {r.pending > 0 ? (
                        <span className="block text-xs text-amber-700 dark:text-amber-400">
                          {t("pendingRow", { count: r.pending })}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      {readOnly ? (
                        musicLabel(r)
                      ) : (
                        <>
                          <MusicSelect eventId={r.eventId} value={r.music} />
                          <span className="hidden print:inline">{musicLabel(r)}</span>
                        </>
                      )}
                    </td>
                    <Td>{r.capacity ?? "–"}</Td>
                    <Td>{r.paidTotal}</Td>
                    <Td>{r.offered}</Td>
                    <Td>{r.tickets}</Td>
                    <Td>{money(r.ticketickCents)}</Td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {readOnly ? null : (
                        <DoorSalesForm
                          sessionId={r.sessionId}
                          tickets={r.doorTickets - r.tillTickets || null}
                          amount={r.doorCents - r.tillCents ? ((r.doorCents - r.tillCents) / 100).toFixed(2) : ""}
                        />
                      )}
                      {r.tillTickets || r.tillCents ? (
                        <span className="block text-xs text-muted-foreground print:hidden">
                          {t("tillSales", { count: r.tillTickets, amount: money(r.tillCents) })}
                        </span>
                      ) : null}
                      <span className={readOnly ? "" : "hidden print:inline"}>
                        {r.doorTickets || r.doorCents ? `${r.doorTickets} · ${money(r.doorCents)}` : "–"}
                      </span>
                    </td>
                    <Td>
                      <span className="font-medium">{money(r.grossCents)}</span>
                    </Td>
                    {vatPercent > 0 ? <Td>{money(r.baseCents)}</Td> : null}
                    <td className="px-3 py-2.5 text-right">
                      {r.music === "NONE" ? (
                        <span className="text-xs">{t("outOfTariff")}</span>
                      ) : (
                        <Badge variant={r.large ? "default" : "secondary"} className="whitespace-nowrap">
                          {r.large ? t("large") : t("small")}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border font-semibold">
                <TotalRow label={t("totalRow", { count: totals.sessions })} f={totals} money={money} vat={vatPercent > 0} />
                <TotalRow
                  label={t("protectedRow", { count: protectedTotals.sessions })}
                  f={protectedTotals}
                  money={money}
                  vat={vatPercent > 0}
                  muted
                />
              </tfoot>
            </table>
          </div>
        </section>
      )}

      <section className="space-y-2 rounded-card border border-border bg-card p-6 text-sm print:border-0 print:p-0 print:text-xs">
        <h2 className="text-lg print:text-sm">{t("notesTitle")}</h2>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          {(["included", "excluded", "invitations", "door", "vat", "category", "programme"] as const).map((k) => (
            <li key={k}>{t(`notes.${k}`)}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function TotalRow({
  label,
  f,
  money,
  vat,
  muted,
}: {
  label: string;
  f: SuisaFigures;
  money: (cents: number) => string;
  vat: boolean;
  muted?: boolean;
}) {
  return (
    <tr className={muted ? "font-normal italic text-muted-foreground" : ""}>
      <td colSpan={4} className="py-2.5 pr-3">
        {label}
      </td>
      <Td>{f.paidTotal}</Td>
      <Td>{f.offered}</Td>
      <Td>{f.tickets}</Td>
      <Td>{money(f.ticketickCents)}</Td>
      <Td>{f.doorTickets || f.doorCents ? `${f.doorTickets} · ${money(f.doorCents)}` : "–"}</Td>
      <Td>{money(f.grossCents)}</Td>
      {vat ? <Td>{money(f.baseCents)}</Td> : null}
      <td />
    </tr>
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
