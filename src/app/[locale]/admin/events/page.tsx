import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarDays, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { getAdminEvents } from "@/lib/data/admin";
import { formatDate, formatPrice } from "@/lib/utils";
import { t as translate, type Translated } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const events = await getAdminEvents();
  const t = await getTranslations("admin");

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("events.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("events.subtitle", { count: events.length })}
          </p>
        </div>
        <Link
          href="/admin/events/new"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary-hover"
        >
          <Plus className="size-4" />
          {t("events.create")}
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">{t("events.event")}</th>
              <th className="px-4 py-3 font-semibold">{t("events.status")}</th>
              <th className="px-4 py-3 font-semibold">
                {t("events.sessions")}
              </th>
              <th className="px-4 py-3 font-semibold">{t("events.next")}</th>
              <th className="px-4 py-3 text-right font-semibold">
                {t("events.sold")}
              </th>
              <th className="px-4 py-3 text-right font-semibold">
                {t("events.revenue")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {events.map((event) => (
              <tr key={event.id} className="hover:bg-muted/30">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/events/${event.id}`}
                    className="font-medium hover:text-primary hover:underline"
                  >
                    {translate(event.title as Translated, locale)}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {event.organizer.name}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant={
                      event.status === "PUBLISHED" ? "default" : "secondary"
                    }
                  >
                    {t(`status.${event.status}`)}
                  </Badge>
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {event.sessions.length}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {event.nextSessionAt
                    ? formatDate(event.nextSessionAt, `${locale}-CH`, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {event.sold} / {event.capacity}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatPrice(event.revenueCents, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {events.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <CalendarDays className="size-4" />
            {t("events.empty")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
