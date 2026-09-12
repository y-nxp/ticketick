import { getTranslations } from "next-intl/server";
import {
  LayoutDashboard,
  CalendarDays,
  Receipt,
  Store,
  Users,
  Settings,
  MessageSquare,
} from "lucide-react";
import { Link } from "@/i18n/navigation";

/**
 * Ossature du backoffice.
 *
 * Ce layout ne protège rien : il n'empêche pas les segments qu'il englobe de
 * s'exécuter. Chaque page appelle `requireAdmin` de son côté, par
 * l'intermédiaire des fonctions de `lib/data/admin`.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("admin");

  const sections = [
    { href: "/admin", label: t("nav.overview"), icon: LayoutDashboard },
    { href: "/admin/events", label: t("nav.events"), icon: CalendarDays },
    { href: "/admin/orders", label: t("nav.orders"), icon: Receipt },
    { href: "/admin/resellers", label: t("nav.resellers"), icon: Store },
    { href: "/admin/users", label: t("nav.users"), icon: Users },
    { href: "/admin/inquiries", label: t("nav.inquiries"), icon: MessageSquare },
    { href: "/admin/settings", label: t("nav.settings"), icon: Settings },
  ] as const;

  return (
    <div className="container-page py-8">
      <div className="flex flex-col gap-8 lg:flex-row">
        <nav aria-label={t("title")} className="lg:w-56 lg:shrink-0">
          <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("title")}
          </p>
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {sections.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Icon className="size-4 shrink-0" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
