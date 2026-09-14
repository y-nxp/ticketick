import { setRequestLocale } from "next-intl/server";
import { LegalPage } from "@/components/layout/legal-page";
import { privacyCopy } from "@/lib/legal/copy";

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
  return (
    <LegalPage
      title={titles[locale] ?? titles.fr}
      doc={privacyCopy(locale)}
    />
  );
}
