import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarPlus, Ticket, Banknote, TrendingUp } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getAllEvents } from "@/lib/mock-data";
import { formatDate, formatPrice } from "@/lib/utils";
import { minPriceCents, t } from "@/lib/types";

export default async function OrganizerDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const to = await getTranslations("organizer");

  const events = getAllEvents();
  const totalSold = events.reduce(
    (sum, e) => sum + e.ticketTypes.reduce((s, tt) => s + tt.sold, 0),
    0,
  );
  const totalRevenue = events.reduce(
    (sum, e) =>
      sum + e.ticketTypes.reduce((s, tt) => s + tt.sold * tt.priceCents, 0),
    0,
  );

  return (
    <div className="container-page py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{to("dashboard")}</h1>
        <Button>
          <CalendarPlus className="size-4" />
          {to("createEvent")}
        </Button>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={<Ticket className="size-5 text-primary" />}
          label={to("ticketsSold")}
          value={totalSold.toLocaleString(`${locale}-CH`)}
        />
        <StatCard
          icon={<Banknote className="size-5 text-primary" />}
          label={to("revenue")}
          value={formatPrice(totalRevenue, `${locale}-CH`)}
        />
        <StatCard
          icon={<TrendingUp className="size-5 text-primary" />}
          label={to("events")}
          value={events.length.toString()}
        />
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold">{to("events")}</h2>
        </div>
        <div className="divide-y divide-border">
          {events.map((e) => {
            const sold = e.ticketTypes.reduce((s, tt) => s + tt.sold, 0);
            const capacity = e.ticketTypes.reduce(
              (s, tt) => s + tt.quantity,
              0,
            );
            const pct = Math.round((sold / capacity) * 100);
            return (
              <Link
                key={e.id}
                href={`/events/${e.slug}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-secondary/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t(e.title, locale)}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(e.startsAt, `${locale}-CH`, {
                      hour: undefined,
                      minute: undefined,
                    })}{" "}
                    · {e.venue.city}
                  </p>
                </div>
                <div className="hidden w-40 sm:block">
                  <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                    <span>
                      {sold}/{capacity}
                    </span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div className="hidden text-right md:block">
                  <p className="text-sm font-medium">
                    {formatPrice(minPriceCents(e), `${locale}-CH`)}
                  </p>
                </div>
                <Badge variant={pct >= 100 ? "solid" : "success"}>
                  {pct >= 100 ? to("ticketsSold") : "OK"}
                </Badge>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  );
}
