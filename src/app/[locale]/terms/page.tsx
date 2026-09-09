import { setRequestLocale } from "next-intl/server";
import { ContentPage } from "@/components/layout/content-page";

const titles: Record<string, string> = {
  fr: "Conditions générales",
  en: "Terms & conditions",
  de: "AGB",
  it: "Termini e condizioni",
};

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ContentPage title={titles[locale] ?? titles.fr} />;
}
