import { setRequestLocale } from "next-intl/server";
import { ContentPage } from "@/components/layout/content-page";

const titles: Record<string, string> = {
  fr: "Confidentialité",
  en: "Privacy",
  de: "Datenschutz",
  it: "Privacy",
};

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ContentPage title={titles[locale] ?? titles.fr} />;
}
