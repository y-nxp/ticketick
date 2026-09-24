import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarX2 } from "lucide-react";
import { requireRole } from "@/lib/auth/dal";
import {
  defaultDoorSession,
  DOOR_ROLES,
  getDoorCounts,
  getDoorSessions,
} from "@/lib/door/scope";
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
    icons: { apple: "/apple-icon" },
    manifest: "/door.webmanifest",
    other: { "mobile-web-app-capable": "yes" },
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

  const { s } = await searchParams;
  const sessions = await getDoorSessions(user, locale);
  const selected =
    sessions.find((x) => x.id === s) ?? defaultDoorSession(sessions);
  const counts = selected ? await getDoorCounts(selected.id) : null;

  return (
    <div className="container-page max-w-lg py-8">
      <h1 className="text-2xl font-extrabold tracking-tight uppercase">
        {t("title")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      <p className="mt-2 text-xs text-muted-foreground">{t("installHint")}</p>
      <div className="mt-6">
        {selected && counts ? (
          <DoorScanner
            key={selected.id}
            sessions={sessions}
            sessionId={selected.id}
            initialCounts={counts}
          />
        ) : (
          <div className="rounded-2xl border border-border bg-card p-6 text-center">
            <CalendarX2 className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 font-medium">{t("noSessions")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("noSessionsHint")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
