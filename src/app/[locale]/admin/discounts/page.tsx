import { getTranslations, setRequestLocale } from "next-intl/server";
import { getAutoDiscounts, getReferenceData } from "@/lib/data/admin-catalog";
import { DiscountsEditor } from "./discounts-editor";

export const dynamic = "force-dynamic";

export default async function AdminDiscountsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [discounts, reference] = await Promise.all([
    getAutoDiscounts(),
    getReferenceData(),
  ]);
  const t = await getTranslations("admin.discounts");

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      <DiscountsEditor
        discounts={discounts}
        organizers={reference.organizers.map((o) => ({ id: o.id, name: o.name }))}
        venues={reference.venues.map((v) => ({ id: v.id, name: v.name, city: v.city }))}
      />
    </div>
  );
}
