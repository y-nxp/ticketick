import { getTranslations } from "next-intl/server";
import { statsActor } from "@/lib/admin/access";
import { prisma } from "@/lib/prisma";
import {
  csvAmount,
  csvLine,
  getSuisaReport,
  readSuisaQuery,
  type SuisaFigures,
} from "@/lib/reports/suisa";
import { t as translate, type Translated } from "@/lib/types";
import { EVENT_TIME_ZONE, slugify } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Rapport SUISA en tableur (CSV pour Excel : « ; », UTF-8 avec BOM). */
export async function GET(request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { organizerId: own } = await statsActor();
  const url = new URL(request.url);
  const query = Object.fromEntries(url.searchParams) as { organizer?: string; from?: string; to?: string; tva?: string };
  const organizerId = own ?? query.organizer ?? null;
  const organizer = organizerId
    ? await prisma.organizer.findUnique({ where: { id: organizerId }, select: { name: true } })
    : null;
  if (!organizerId || !organizer) return new Response("Not found", { status: 404 });

  const t = await getTranslations({ locale, namespace: "admin.suisa" });
  const { from, to, vatPercent } = readSuisaQuery(query);
  const { rows, totals, protectedTotals } = await getSuisaReport(organizerId, { from, to, vatPercent });
  const vat = vatPercent > 0;

  const date = new Intl.DateTimeFormat("fr-CH", {
    timeZone: EVENT_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const hour = new Intl.DateTimeFormat("fr-CH", { timeZone: EVENT_TIME_ZONE, hour: "2-digit", minute: "2-digit" });

  const day = (d: string) => d.split("-").reverse().join(".");
  const header = [
    t("date"),
    t("time"),
    t("concert"),
    t("venue"),
    t("music"),
    t("capacity"),
    t("paidTicketick"),
    t("doorTickets"),
    t("paidShort"),
    t("offeredShort"),
    t("total"),
    t("ticketick"),
    t("doorAmount"),
    t("gross"),
    ...(vat ? [t("base")] : []),
    t("category"),
  ];
  const figures = (f: SuisaFigures) => [
    f.paid,
    f.doorTickets,
    f.paidTotal,
    f.offered,
    f.tickets,
    csvAmount(f.ticketickCents),
    csvAmount(f.doorCents),
    csvAmount(f.grossCents),
    ...(vat ? [csvAmount(f.baseCents)] : []),
  ];
  const lines = [
    csvLine([`${t("title")} · ${organizer.name}`]),
    csvLine([t("period", { from: day(from), to: day(to) })]),
    csvLine([vat ? t("baseHintVat", { rate: vatPercent }) : t("baseHintNoVat")]),
    "",
    csvLine(header),
    ...rows.map((r) =>
      csvLine([
        date.format(r.startsAt),
        hour.format(r.startsAt),
        `${r.music === "PROTECTED" ? "* " : ""}${translate(r.eventTitle as Translated, locale)}`,
        r.venue ?? "",
        t(`musicValues.${r.music ?? "unset"}`),
        r.capacity ?? "",
        ...figures(r),
        r.music === "NONE" ? t("outOfTariff") : r.large ? t("large") : t("small"),
      ]),
    ),
    csvLine([t("totalRow", { count: totals.sessions }), "", "", "", "", "", ...figures(totals), ""]),
    csvLine([t("protectedRow", { count: protectedTotals.sessions }), "", "", "", "", "", ...figures(protectedTotals), ""]),
    "",
    ...(["included", "excluded", "invitations", "door", "vat", "category", "programme"] as const).map((k) =>
      csvLine([t(`notes.${k}`)]),
    ),
  ];

  const filename = `suisa-${slugify(organizer.name)}-${from}-${to}.csv`;
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
