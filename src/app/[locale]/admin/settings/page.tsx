import { getTranslations, setRequestLocale } from "next-intl/server";
import { getReferenceData } from "@/lib/data/admin-catalog";
import {
  CategoriesSection,
  OrganizersSection,
  VenuesSection,
} from "./reference-sections";

/**
 * Données de référence du catalogue.
 *
 * `getReferenceData` appelle `requireAdmin` : le contrôle des droits est porté
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
  const { organizers, venues, categories } = await getReferenceData();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      {organizers.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
          {t("startHere")}
        </p>
      ) : null}

      <OrganizersSection organizers={organizers} />
      <VenuesSection venues={venues} />
      <CategoriesSection categories={categories} />
    </div>
  );
}
