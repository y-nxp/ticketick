import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LayoutDashboard, ListOrdered, TicketPlus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireResellerAgent } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const agent = await requireResellerAgent("/pos");
  const t = await getTranslations("pos");
  const reseller = await prisma.reseller.findUniqueOrThrow({
    where: { id: agent.resellerId },
    select: { name: true },
  });
  const sections = [
    { href: "/pos", label: t("nav.overview"), icon: LayoutDashboard },
    { href: "/pos/sell", label: t("nav.sell"), icon: TicketPlus },
    { href: "/pos/sales", label: t("nav.sales"), icon: ListOrdered },
  ];
  return (
    <div className="container-page py-8">
      <div className="flex flex-col gap-8 lg:flex-row">
        <nav aria-label={t("title")} className="lg:w-56 lg:shrink-0">
          <p className="brand-label mb-3 px-3 text-xs text-muted-foreground">{reseller.name}</p>
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {sections.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center gap-2.5 whitespace-nowrap rounded-control px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
