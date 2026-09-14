import { setRequestLocale } from "next-intl/server";
import { LegalPage } from "@/components/layout/legal-page";
import { termsCopy } from "@/lib/legal/copy";

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
  return (
    <LegalPage
      title={titles[locale] ?? titles.fr}
      doc={termsCopy(locale)}
    />
  );
}
