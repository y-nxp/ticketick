import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  CalendarDays,
  Ticket,
  Banknote,
  Receipt,
  Users,
  Store,
} from "lucide-react";
import { getAdminOverview } from "@/lib/data/admin";
import { formatPrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // `getAdminOverview` exige le rôle administrateur avant toute lecture.
  const data = await getAdminOverview();
  const t = await getTranslations("admin");

  const cards = [
    {
      icon: CalendarDays,
      label: t("overview.events"),
      value: String(data.events.total),
      hint: t("overview.eventsHint", {
        published: data.events.published,
        draft: data.events.draft,
      }),
    },
    {
      icon: CalendarDays,
      label: t("overview.sessions"),
      value: String(data.sessions.total),
      hint: t("overview.sessionsHint", { upcoming: data.sessions.upcoming }),
    },
    {
      icon: Ticket,
      label: t("overview.sold"),
      value: `${data.inventory.sold} / ${data.inventory.capacity}`,
      hint: t("overview.soldHint", {
        percent: percent(data.inventory.sold, data.inventory.capacity),
      }),
    },
    {
      icon: Banknote,
      label: t("overview.revenue"),
      value: formatPrice(data.inventory.revenueCents, locale),
      hint: t("overview.revenueHint"),
    },
    {
      icon: Receipt,
      label: t("overview.orders"),
      value: String(data.orders.total),
      hint: formatPrice(data.orders.paidCents, locale),
    },
    {
      icon: Users,
      label: t("overview.users"),
      value: String(data.users.total),
      hint: t("overview.usersHint", { admins: data.users.admins }),
    },
    {
      icon: Store,
      label: t("overview.resellers"),
      value: String(data.resellers.total),
      hint: formatPrice(data.resellers.balanceCents, locale),
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">
        {t("overview.title")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("overview.subtitle")}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ icon: Icon, label, value, hint }) => (
          <div
            key={label}
            className="rounded-2xl border border-border bg-card p-5"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <Icon className="size-4" />
              <span className="text-sm font-medium">{label}</span>
            </div>
            <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          </div>
        ))}
      </div>

      {data.orders.total === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
          {t("overview.noOrdersYet")}
        </p>
      ) : null}
    </div>
  );
}

function percent(part: number, whole: number): number {
  // Sans stock défini, un taux de remplissage n'aurait pas de sens.
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}
