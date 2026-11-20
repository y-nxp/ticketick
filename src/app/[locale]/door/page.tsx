import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarX2 } from "lucide-react";
import { requireRole } from "@/lib/auth/dal";
import { redirect } from "@/i18n/navigation";
import {
  canScan,
  canUseTill,
  defaultDoorSession,
  DOOR_ROLES,
  getDoorCounts,
  getDoorSessions,
} from "@/lib/door/scope";
import { DoorHeader } from "./door-header";
import { DoorScanner } from "./door-scanner";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("door");
  return {
    title: t("title"),
    appleWebApp: {
      capable: true,
      title: t("title"),
      statusBarStyle: "default",
    },
    // Pas d'`icons` ici : une page qui en déclare remplace les icônes du site
    // (src/app/icon.svg, apple-icon.png) au lieu de s'y ajouter.
    manifest: "/door.webmanifest",
    // Next n'écrit que « mobile-web-app-capable » ; l'iPhone lit encore l'ancienne
    // balise pour ouvrir l'app installée en plein écran, sans barre Safari.
    other: { "apple-mobile-web-app-capable": "yes" },
  };
}

export default async function DoorPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRole(DOOR_ROLES, "/door");
  const t = await getTranslations("door");
  const till = canUseTill(user);
  // Équipe de caisse seulement : pas de contrôle des billets.
  if (!canScan(user) && till) redirect({ href: "/door/sell", locale });

  const { s } = await searchParams;
  const sessions = await getDoorSessions(user, locale);
  const selected =
    sessions.find((x) => x.id === s) ?? defaultDoorSession(sessions);
  const counts = selected && canScan(user) ? await getDoorCounts(selected.id) : null;

  if (selected && counts) {
    return (
      <DoorScanner
        key={selected.id}
        sessions={sessions}
        sessionId={selected.id}
        initialCounts={counts}
        till={till}
      />
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <DoorHeader till={till} />
      <div className="mx-auto w-full max-w-lg px-4 py-8">
        <div className="rounded-card border border-border bg-card p-6 text-center">
          <CalendarX2 className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-medium">{t("noSessions")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("noSessionsHint")}</p>
        </div>
      </div>
    </div>
  );
}
