import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getSessionSeats } from "@/lib/data/admin-catalog";
import { t as translate, type Translated } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { SeatBlocker } from "./seat-blocker";

export const dynamic = "force-dynamic";

export default async function SessionSeatsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; sessionId: string }>;
}) {
  const { locale, id, sessionId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.seats");

  const data = await getSessionSeats(id, sessionId);
  if (!data) notFound();
  const { session, layout, seats } = data;

  const byZone = layout.zones.map((zone) => {
    const inZone = seats.filter((s) => s.zone === zone.key);
    return {
      zone,
      total: inZone.length,
      sold: inZone.filter((s) => s.status === "RESERVED").length,
      blocked: inZone.filter((s) => s.status === "BLOCKED").length,
    };
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">
          <Link href={`/admin/events/${id}`} className="hover:text-foreground">
            {t("back")}
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {translate(session.event.title as Translated, locale)}
          {" · "}
          {formatDate(session.startsAt, `${locale}-CH`)}
          {session.label ? ` · ${translate(session.label as Translated, locale)}` : null}
        </p>
      </header>

      <div className="overflow-x-auto rounded-card border border-border">
        <table className="w-full min-w-[32rem] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">{t("zone")}</th>
              <th className="px-4 py-3 text-right font-semibold">{t("total")}</th>
              <th className="px-4 py-3 text-right font-semibold">{t("sold")}</th>
              <th className="px-4 py-3 text-right font-semibold">{t("blocked")}</th>
              <th className="px-4 py-3 text-right font-semibold">{t("available")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border tabular-nums">
            {byZone.map((row) => (
              <tr key={row.zone.key}>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="inline-block size-3.5 rounded-[3px] border border-black/20"
                      style={{ background: row.zone.color }}
                    />
                    {translate(row.zone.name, locale)}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">{row.total}</td>
                <td className="px-4 py-2.5 text-right">{row.sold}</td>
                <td className="px-4 py-2.5 text-right">{row.blocked}</td>
                <td className="px-4 py-2.5 text-right font-semibold">
                  {row.total - row.sold - row.blocked}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SeatBlocker
        eventId={id}
        sessionId={session.id}
        locale={locale}
        layout={layout}
        seats={seats.map((s) => ({
          key: s.seatKey,
          status: s.status,
          note: s.blockNote,
          reference: s.order?.reference ?? null,
        }))}
      />
    </div>
  );
}
