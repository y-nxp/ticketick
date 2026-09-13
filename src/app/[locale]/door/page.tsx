import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireRole } from "@/lib/auth/dal";
import { DoorScanner } from "./door-scanner";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Contrôle",
    appleWebApp: {
      capable: true,
      title: "Contrôle",
      statusBarStyle: "default",
    },
    icons: { apple: "/apple-icon" },
    manifest: "/door.webmanifest",
    other: { "mobile-web-app-capable": "yes" },
  };
}

export default async function DoorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole(["ADMIN", "ORGANIZER"], "/door");
  const t = await getTranslations("door");

  return (
    <div className="container-page max-w-lg py-8">
      <h1 className="text-2xl font-extrabold tracking-tight uppercase">
        {t("title")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      <p className="mt-2 text-xs text-muted-foreground">{t("installHint")}</p>
      <div className="mt-6">
        <DoorScanner />
      </div>
    </div>
  );
}
