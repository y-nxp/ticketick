import { getTranslations, setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { getReferenceData } from "@/lib/data/admin-catalog";
import {
  CategoriesSection,
  OrganizersSection,
  VenuesSection,
} from "./reference-sections";

/**
 * Données de référence du catalogue.
 *
 * `getReferenceData` appelle `catalogActor` : le contrôle des droits est porté
 * par la lecture elle-même, pas par cette page.
 */
export const dynamic = "force-dynamic";

export default async function AdminSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("admin.settings");
  const [data, user] = await Promise.all([
    getReferenceData(),
    getCurrentUser(),
  ]);
  const { organizers, venues, categories } = data;
  const restricted = user?.role === "ORGANIZER";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(restricted ? "subtitleOrganizer" : "subtitle")}
        </p>
      </header>

      {organizers.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
          {t("startHere")}
        </p>
      ) : null}

      <OrganizersSection organizers={organizers} restricted={restricted} />
      {restricted ? null : (
        <>
          <VenuesSection venues={venues} />
          <CategoriesSection categories={categories} />
        </>
      )}
    </div>
  );
}
