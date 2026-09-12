import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarPlus, Ticket, Banknote, TrendingUp } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getPublishedEvents } from "@/lib/data/events";
import { requireRole } from "@/lib/auth/dal";
import { formatDate, formatPrice } from "@/lib/utils";
import { minPriceCents, nextSession, t } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OrganizerDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Contrôle dans la page et non dans un layout : un layout ne décide pas du
  // rendu des segments qu'il englobe, la page s'exécuterait malgré tout.
  // Les accès organisateur ne s'ouvrent pas tout seuls : pour l'instant seul
  // le compte administrateur gère le catalogue. Un rôle ORGANIZER attribué
  // plus tard aura son propre espace.
  await requireRole(["ADMIN"], "/organizer/dashboard");

  const to = await getTranslations("organizer");

  const events = await getPublishedEvents();

  // Les ventes se comptent au niveau des séances : un spectacle joué trois
  // fois cumule le stock écoulé de ses trois dates.
  const allTicketTypes = events.flatMap((e) =>
    e.sessions.flatMap((s) => s.ticketTypes),
  );
  const totalSold = allTicketTypes.reduce((sum, tt) => sum + tt.sold, 0);
  const totalRevenue = allTicketTypes.reduce(
    (sum, tt) => sum + tt.sold * tt.priceCents,
    0,
  );

  return (
    <div className="container-page py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{to("dashboard")}</h1>
        <Link href="/admin/events/new">
          <Button>
            <CalendarPlus className="size-4" />
            {to("createEvent")}
          </Button>
        </Link>
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
            const tickets = e.sessions.flatMap((s) => s.ticketTypes);
            const sold = tickets.reduce((s, tt) => s + tt.sold, 0);
            const capacity = tickets.reduce((s, tt) => s + tt.quantity, 0);
            const pct = capacity ? Math.round((sold / capacity) * 100) : 0;
            const session = nextSession(e);
            return (
              <Link
                key={e.id}
                href={`/events/${e.slug}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-secondary/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t(e.title, locale)}</p>
                  <p className="text-sm text-muted-foreground">
                    {session
                      ? formatDate(session.startsAt, `${locale}-CH`, {
                          hour: undefined,
                          minute: undefined,
                        })
                      : "—"}
                    {session?.venue ? ` · ${session.venue.city}` : ""}
                    {e.sessions.length > 1
                      ? ` · ${e.sessions.length} ${to("sessions")}`
                      : ""}
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
