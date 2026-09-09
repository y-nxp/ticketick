import { setRequestLocale } from "next-intl/server";
import { ContentPage } from "@/components/layout/content-page";

const titles: Record<string, string> = {
  fr: "Centre d'aide",
  en: "Help center",
  de: "Hilfezentrum",
  it: "Centro assistenza",
};

export default async function HelpPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ContentPage title={titles[locale] ?? titles.fr} />;
}
