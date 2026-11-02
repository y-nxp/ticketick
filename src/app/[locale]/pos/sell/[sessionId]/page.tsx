import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireResellerAgent } from "@/lib/auth/dal";
import { mockPaymentsAllowed } from "@/lib/payment/config";
import { cardAccountForOrganizer } from "@/lib/payment/card-account";
import { prisma } from "@/lib/prisma";
import { getPosSession } from "@/lib/resellers/data";
import { t as translate, type Translated } from "@/lib/types";
import { formatDate, formatPrice } from "@/lib/utils";
import { PosSaleForm } from "./sale-form";

export const dynamic = "force-dynamic";

export default async function PosSessionPage({
  params,
}: {
  params: Promise<{ locale: string; sessionId: string }>;
}) {
  const { locale, sessionId } = await params;
  setRequestLocale(locale);
  const agent = await requireResellerAgent(`/pos/sell/${sessionId}`);
  const t = await getTranslations("pos.sell");
  const data = await getPosSession(agent, sessionId);
  if (!data) notFound();
  const { session, types } = data;

  const reseller = await prisma.reseller.findUniqueOrThrow({
    where: { id: agent.resellerId },
    select: {
      allowCashSales: true,
      allowTerminalSales: true,
      allowOnlineSales: true,
      allowPausedSales: true,
    },
  });
  const onlineReady =
    reseller.allowOnlineSales &&
    (mockPaymentsAllowed() || (await cardAccountForOrganizer(session.event.organizerId)) !== null);
  const methods = [
    ...(reseller.allowCashSales ? (["CASH"] as const) : []),
    ...(reseller.allowTerminalSales ? (["TERMINAL"] as const) : []),
    ...(onlineReady ? (["ONLINE"] as const) : []),
  ];
  const paused = session.event.salesPaused;
  const title = translate(session.event.title as Translated, locale);
  const when = [
    formatDate(session.startsAt, `${locale}-CH`),
    session.label ? translate(session.label as Translated, locale) : null,
    session.venue ? `${session.venue.name}, ${session.venue.city}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">
          <Link href="/pos/sell" className="hover:text-foreground">
            {t("back")}
          </Link>
        </p>
        <h1 className="mt-2 text-2xl">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{when}</p>
      </header>
      {paused && reseller.allowPausedSales ? (
        <p className="rounded-control bg-amber-100 px-3.5 py-2.5 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
          {t("pausedAllowed")}
        </p>
      ) : null}
      {paused && !reseller.allowPausedSales ? (
        <p className="rounded-card border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("paused")}
        </p>
      ) : types.length === 0 ? (
        <p className="rounded-card border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("noTariffs")}
        </p>
      ) : methods.length === 0 ? (
        <p className="rounded-card border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("noMethod")}
        </p>
      ) : (
        <PosSaleForm
          agentId={agent.id}
          sessionId={session.id}
          title={title}
          when={when}
          locale={locale}
          methods={methods}
          seated={data.seated}
          rows={types.map((tt) => ({
            id: tt.id,
            name: translate(tt.name as Translated, locale),
            price: formatPrice(tt.priceCents, `${locale}-CH`),
            priceCents: tt.priceCents,
            available: tt.available,
            companion: tt.maxPerPaidTicket != null,
            requiresAttendee: tt.requiresAttendee,
            maxAgeYears: tt.maxAgeYears,
            zones: tt.seatZones,
          }))}
        />
      )}
    </div>
  );
}
