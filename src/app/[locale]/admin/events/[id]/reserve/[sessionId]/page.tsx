import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { getSessionForReservation } from "@/lib/data/admin-catalog";
import { t as translate, type Translated } from "@/lib/types";
import { formatDate, formatPrice } from "@/lib/utils";
import { ReservationForm } from "./reservation-form";

export const dynamic = "force-dynamic";

export default async function ReserveSessionPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; sessionId: string }>;
}) {
  const { locale, id, sessionId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.reservation");
  const ta = await getTranslations("admin");

  const data = await getSessionForReservation(id, sessionId);
  if (!data) notFound();
  const { session, layout, freeByZone, reservations } = data;
  const past = session.startsAt <= new Date();

  const zones = new Map(layout?.zones.map((z) => [z.key, z]) ?? []);
  const rows = session.ticketTypes.map((tt) => {
    let available = Math.max(0, tt.quantity - tt.sold);
    let zoneLabel: string | null = null;
    if (freeByZone) {
      const keys = tt.seatZones.length ? tt.seatZones : [...zones.keys()];
      const free = keys.reduce((n, key) => n + (freeByZone[key] ?? 0), 0);
      available = Math.min(available, free);
      zoneLabel = keys
        .map((key) => zones.get(key))
        .filter((z) => z != null)
        .map((z) => translate(z.name, locale))
        .join(", ");
    }
    const name = translate(tt.name as Translated, locale);
    return {
      id: tt.id,
      name,
      price: formatPrice(tt.priceCents, locale),
      available,
      zoneLabel: zoneLabel === name ? null : zoneLabel,
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
          {session.venue ? ` · ${session.venue.name}` : null}
        </p>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          {layout ? t("introSeated") : t("intro")}
        </p>
      </header>

      {past ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          {t("errors.sessionPast")}
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          {t("noTariffs")}
        </p>
      ) : (
        <ReservationForm
          eventId={id}
          sessionId={session.id}
          locale={locale}
          rows={rows}
        />
      )}

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-semibold">
          {t("existing", { count: reservations.length })}
        </h2>
        {reservations.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("none")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {reservations.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm"
              >
                <Link
                  href={`/admin/orders/${r.id}`}
                  className="font-mono text-xs font-medium hover:text-primary hover:underline"
                >
                  {r.reference}
                </Link>
                <span className="min-w-0 flex-1 truncate">
                  {[r.ticketNote, r.lastName].filter(Boolean).join(" · ") ||
                    t("anonymous")}
                </span>
                <span className="text-muted-foreground">
                  {t("ticketCount", { count: r._count.tickets })}
                </span>
                {r.status === "PAID" ? (
                  <a
                    href={`/api/tickets/pdf?ref=${encodeURIComponent(r.reference)}`}
                    className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
                  >
                    <Download className="size-3.5" />
                    {t("download")}
                  </a>
                ) : (
                  <Badge variant="secondary">{ta(`orderStatus.${r.status}`)}</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
