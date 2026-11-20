import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, CalendarX2, ChevronRight } from "lucide-react";
import { Link, redirect } from "@/i18n/navigation";
import { requireRole } from "@/lib/auth/dal";
import { currentSaleSession, doorTillEnabled, getSaleSession, getSaleSessions } from "@/lib/door/sale";
import { DOOR_ROLES } from "@/lib/door/scope";
import { cn, EVENT_TIME_ZONE } from "@/lib/utils";
import { DoorHeader } from "../door-header";
import { DoorSaleForm } from "./sale-form";
import { TillNotice } from "./till-notice";
import { TillTotalsCard } from "./till-totals";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("door.sell");
  return { title: t("title"), robots: { index: false } };
}

/**
 * Caisse sur place : tous les concerts à venir, le prochain en tête ; on le
 * choisit, puis les tarifs, puis Collect encaisse.
 */
export default async function DoorSellPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRole(DOOR_ROLES, "/door/sell");
  if (!(await doorTillEnabled(user))) redirect({ href: "/door", locale });
  const t = await getTranslations("door.sell");
  const { s } = await searchParams;
  const selected = s ? await getSaleSession(user, s, locale) : null;
  const sessions = selected ? [] : await getSaleSessions(user, locale);
  // Le prochain : celui qui n'a pas commencé il y a plus de deux heures.
  const next = currentSaleSession(sessions);
  const when = (date: Date) =>
    new Intl.DateTimeFormat(`${locale}-CH`, {
      timeZone: EVENT_TIME_ZONE,
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);

  return (
    <div className="flex min-h-dvh flex-col">
      <DoorHeader active="sell" till />
      <div className="mx-auto w-full max-w-lg flex-1 space-y-4 px-4 py-5">
        <TillNotice />
        {selected ? (
          <div className="space-y-4">
            <Link href="/door/sell" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <ArrowLeft className="size-4" />
              {t("otherConcert")}
            </Link>
            <div>
              <h2 className="text-xl font-bold tracking-tight">{selected.title}</h2>
              <p className="text-sm text-muted-foreground">
                {when(selected.startsAt)}
                {selected.venue ? ` · ${selected.venue}` : ""}
              </p>
            </div>
            <DoorSaleForm
              key={selected.id}
              sessionId={selected.id}
              locale={locale}
              twintNumber={selected.twintNumber}
              tariffs={selected.tariffs.map(({ id, name, priceCents, soldAtTill }) => ({
                id,
                name,
                priceCents,
                soldAtTill,
              }))}
            />
            <TillTotalsCard totals={selected.totals} locale={locale} />
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-card border border-border bg-card p-6 text-center">
            <CalendarX2 className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 font-medium">{t("noSessions")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">{t("chooseConcert")}</h2>
            <ul className="divide-y divide-border rounded-card border border-border bg-card">
              {sessions.map((session) => {
                const isNext = session.id === next?.id;
                return (
                  <li key={session.id}>
                    <Link
                      href={{ pathname: "/door/sell", query: { s: session.id } }}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 hover:bg-muted/50",
                        isNext && "bg-primary/5",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm tabular-nums text-muted-foreground">
                          {when(session.startsAt)}
                          {isNext ? (
                            <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                              {t("next")}
                            </span>
                          ) : null}
                        </p>
                        <p className={cn("font-medium", isNext && "text-lg")}>{session.title}</p>
                      </div>
                      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
