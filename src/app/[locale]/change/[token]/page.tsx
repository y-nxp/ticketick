import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Clock, XCircle } from "lucide-react";
import { intlLocale } from "@/lib/i18n-fallback";
import { changePageData } from "@/lib/orders/seat-change";
import { ticketPdfPath } from "@/lib/tickets/download";
import { t as translate } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { SeatChanger } from "./seat-changer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const CONTACT = "ticket@ticketick.ch";

export default async function ChangePage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("change");
  const data = await changePageData(token);
  if (data.state === "invalid") notFound();
  const fmt = intlLocale(locale);

  if (data.state !== "open" || data.sessions.length === 0) {
    const used = data.state === "used";
    return (
      <div className="container-page py-12">
        <div className="mx-auto max-w-xl rounded-card border border-border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-muted">
            <XCircle className="size-7 text-muted-foreground" />
          </div>
          <h1 className="mt-4 text-2xl">{used ? t("usedTitle") : t("expiredTitle")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(used ? "usedText" : "expiredText", { contact: CONTACT })}
          </p>
          <p className="mt-4 text-sm">
            <a
              href={`mailto:${CONTACT}?subject=${encodeURIComponent(data.reference)}`}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              {CONTACT}
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl">{t("title")}</h1>
        <SeatChanger
          header={
            <>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                {t("intro", { reference: data.reference })}
              </p>
              <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="size-4 shrink-0" />
                {t("validUntil", {
                  date: formatDate(data.expiresAt, fmt, { weekday: "long" }),
                })}
              </p>
              {data.pending ? (
                <p className="mt-4 rounded-card border border-border bg-secondary px-4 py-3 text-sm">
                  {t("pending")}
                </p>
              ) : null}
            </>
          }
          token={token}
          locale={locale}
          currency={data.currency}
          email={data.email}
          pdfUrl={ticketPdfPath(data.reference)}
          sessions={data.sessions.map((session) => {
            const nameOf = new Map(
              session.tariffs.map((x) => [x.id, translate(x.name, locale)]),
            );
            return {
              id: session.id,
              title: translate(session.eventTitle, locale),
              when: formatDate(session.startsAt, fmt, { weekday: "long" }),
              venue: session.venue,
              layout: session.layout,
              taken: session.taken,
              tariffs: session.tariffs.map((x) => ({
                id: x.id,
                name: nameOf.get(x.id) ?? "",
                priceCents: x.priceCents,
                seatZones: x.seatZones,
                restricted: x.restricted,
                available: x.available,
              })),
              tickets: session.tickets.map((ticket) => ({
                ...ticket,
                tariffName: nameOf.get(ticket.ticketTypeId) ?? "",
              })),
            };
          })}
        />
      </div>
    </div>
  );
}
