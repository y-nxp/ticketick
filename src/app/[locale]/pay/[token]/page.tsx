import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, FileDown, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { intlLocale } from "@/lib/i18n-fallback";
import {
  chargeForToken,
  confirmLinkReturn,
  linkIsPayable,
} from "@/lib/orders/charges";
import { cardAccountForOrder } from "@/lib/payment/card-account";
import { prisma } from "@/lib/prisma";
import { ticketPdfPath } from "@/lib/tickets/download";
import { t as translate, type Translated } from "@/lib/types";
import { formatDate, formatPrice } from "@/lib/utils";
import { PayButton } from "./pay-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; token: string }>;
  searchParams: Promise<{ done?: string; mock?: string }>;
}) {
  const { locale, token } = await params;
  const { done, mock } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("pay");

  if (done) {
    await confirmLinkReturn(token, mock === "1").catch((error) => {
      console.error("[lien] retour du paiement", error);
    });
  }
  const charge = await chargeForToken(token);
  if (!charge || charge.kind !== "PAYMENT") notFound();

  const tickets = await prisma.ticket.findMany({
    where: { id: { in: charge.ticketIds } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      seatLabel: true,
      ticketType: {
        select: {
          name: true,
          session: {
            select: {
              startsAt: true,
              venue: { select: { name: true, city: true } },
              event: {
                select: {
                  title: true,
                  organizer: {
                    select: { name: true, email: true, logoUrl: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  const organizer = tickets[0]?.ticketType.session.event.organizer;
  const fmt = intlLocale(locale);
  const amount = formatPrice(charge.amountCents, fmt, charge.currency);
  const payable = linkIsPayable(charge);
  const change = charge.replacesTicketIds.length > 0;
  const provider = payable
    ? ((await cardAccountForOrder(charge.order.reference))?.provider ?? "other")
    : "other";

  return (
    <div className="container-page py-12">
      <div className="mx-auto max-w-xl">
        {organizer?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={organizer.logoUrl}
            alt={organizer.name}
            className="mx-auto mb-6 h-14 w-auto object-contain"
          />
        ) : organizer ? (
          <p className="brand-label mb-6 text-center text-sm text-muted-foreground">
            {organizer.name}
          </p>
        ) : null}

        <div className="rounded-card border border-border bg-card p-6 shadow-sm">
          {charge.status === "DONE" ? (
            <Status
              icon="ok"
              title={t("paidTitle")}
              text={t("paidText", { email: charge.order.email })}
            />
          ) : payable ? (
            <>
              <h1 className="text-2xl font-extrabold tracking-tight">
                {change ? t("changeTitle") : t("title")}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {change
                  ? t("changeIntro")
                  : t("intro", { organizer: organizer?.name ?? "" })}
              </p>
            </>
          ) : (
            <Status
              icon="off"
              title={t("closedTitle")}
              text={
                change
                  ? t("changeClosedText")
                  : t("closedText", { organizer: organizer?.name ?? "" })
              }
            />
          )}

          <ul className="mt-6 divide-y divide-border rounded-control border border-border">
            {tickets.map((ticket) => {
              const session = ticket.ticketType.session;
              return (
                <li key={ticket.id} className="px-4 py-3 text-sm">
                  <p className="font-semibold">
                    {translate(session.event.title as Translated, locale)}
                  </p>
                  <p className="text-muted-foreground">
                    {formatDate(session.startsAt, fmt, { weekday: "long" })}
                    {session.venue
                      ? ` · ${session.venue.name}, ${session.venue.city}`
                      : ""}
                  </p>
                  <p className="mt-1">
                    {translate(ticket.ticketType.name as Translated, locale)}
                    {ticket.seatLabel ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {ticket.seatLabel}
                      </span>
                    ) : null}
                  </p>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex items-baseline justify-between">
            <span className="font-semibold">{t("total")}</span>
            <span className="text-xl font-extrabold tabular-nums">
              {amount}
            </span>
          </div>
          <p className="mt-1 text-right font-mono text-xs text-muted-foreground">
            {t("reference", { reference: charge.number })}
          </p>

          {charge.status === "DONE" ? (
            <a
              href={ticketPdfPath(charge.order.reference)}
              target="_blank"
              rel="noreferrer"
              className="mt-6 block"
            >
              <Button size="lg" variant="outline" className="w-full">
                <FileDown className="size-4" />
                {t("download")}
              </Button>
            </a>
          ) : payable ? (
            <div className="mt-6 space-y-3">
              {charge.dueAt ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="size-4 shrink-0" />
                  {t("due", {
                    date: formatDate(charge.dueAt, fmt, { weekday: "long" }),
                  })}
                </p>
              ) : null}
              <PayButton token={token} locale={locale} amount={amount} />
              <p className="text-xs text-muted-foreground">{t("secure", { provider })}</p>
            </div>
          ) : organizer?.email ? (
            <p className="mt-6 text-sm">
              <a
                href={`mailto:${organizer.email}`}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                {organizer.email}
              </a>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Status({
  icon,
  title,
  text,
}: {
  icon: "ok" | "off";
  title: string;
  text: string;
}) {
  return (
    <div className="text-center">
      <div
        className={`mx-auto grid size-14 place-items-center rounded-full ${
          icon === "ok" ? "bg-[var(--success)]/12" : "bg-muted"
        }`}
      >
        {icon === "ok" ? (
          <CheckCircle2 className="size-7 text-[var(--success)]" />
        ) : (
          <XCircle className="size-7 text-muted-foreground" />
        )}
      </div>
      <h1 className="mt-4 text-2xl font-extrabold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
